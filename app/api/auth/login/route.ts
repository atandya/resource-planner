import { NextRequest, NextResponse } from 'next/server';
import { login, getUserWithProfile, getDepartment } from '@/lib/api/timetrack-client';
import { determineAccessLevel } from '@/lib/auth/access-level';
import { createSession, SessionData } from '@/lib/auth/session';
import { getMySqlApiClient } from '@/lib/mysql/api-client';
import { createRequestTiming } from '@/lib/observability/request-timing';

export async function POST(request: NextRequest) {
  const timing = createRequestTiming("login_api");

  try {
    const { email, password } = await request.json();

    console.log('[Login API] Login attempt for:', email);

    // Validate input
    if (!email || !password) {
      timing.total({ result: "invalid_input" });
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // 1. Call timetrack login API
    const loginResult = await login(email, password);
    timing.phase("credential_exchange", { result: loginResult.success ? "success" : "failure" });

    console.log('[Login API] Login result:', {
      success: loginResult.success,
      hasData: !!loginResult.data,
      message: loginResult.message
    });

    if (!loginResult.success || !loginResult.data) {
      timing.total({ result: "invalid_credentials" });
      return NextResponse.json(
        { error: loginResult.message || 'Invalid credentials' },
        { status: 401 }
      );
    }

    const { access_token, user } = loginResult.data;

    // 2. Fetch user with profile (employee data)
    const userProfile = await getUserWithProfile(access_token, user.id);
    timing.phase("profile_lookup", { result: userProfile.data?.profile ? "success" : "missing" });

    if (!userProfile.data || !userProfile.data.profile) {
      console.log('[Login API] No employee profile found for user');
      timing.total({ result: "missing_profile" });
      return NextResponse.json(
        { error: 'No employee profile found for this user' },
        { status: 404 }
      );
    }

    const employee = userProfile.data.profile;

    // 3. Fetch department data to get department_name
    let department_name = 'Unknown';
    if (employee.dept_id) {
      const deptResult = await getDepartment(access_token, employee.dept_id);
      if (deptResult.data && deptResult.data.department_name) {
        department_name = deptResult.data.department_name;
      }
    }
    timing.phase("department_lookup", { found: department_name !== "Unknown" });

    console.log('[Login API] Employee data:', {
      id: employee.id,
      uuid: employee.uuid,
      name: employee.full_name || employee.name,
      department: department_name,
      position: employee.position
    });

    // DEBUG: Check if UUID is missing from timetrack API
    let employeeUuid = employee.uuid || '';
    if (!employee.uuid) {
      console.error('[Login API] WARNING: Employee UUID is missing from timetrack API response!', {
        employeeId: employee.id,
        employeeKeys: Object.keys(employee),
        fullProfile: employee
      });

      // Try to fetch UUID from MySQL API as fallback
      try {
        console.log('[Login API] Attempting to fetch UUID from MySQL API...');
        const mysqlClient = getMySqlApiClient(async () => access_token);
        const mysqlResponse = await mysqlClient.getEmployees({
          search: employee.nik || employee.full_name || '',
          per_page: 10,
        });

        if (!mysqlResponse.error && mysqlResponse.data?.data) {
          const mysqlEmployees = mysqlResponse.data.data as Array<{
            nik?: string;
            full_name?: string;
            uuid?: string;
          }>;
          const mysqlEmployee = mysqlEmployees.find((emp) =>
            emp.nik === employee.nik || emp.full_name === employee.full_name
          );
          if (mysqlEmployee?.uuid) {
            employeeUuid = mysqlEmployee.uuid;
            console.log('[Login API] Successfully fetched UUID from MySQL API:', employeeUuid);
          } else {
            console.error('[Login API] Could not find matching employee in MySQL API');
          }
        } else {
          console.error('[Login API] MySQL API returned error:', mysqlResponse.error);
        }
      } catch (error) {
        console.error('[Login API] Error fetching from MySQL API:', error);
      }
      timing.phase("uuid_fallback", { found: !!employeeUuid });
    }

    // 4. Determine access level (by stable nik + dept_id, not name)
    if (!employee.dept_id) {
      console.warn(
        '[Login API] Employee has no dept_id; access relies on NIK allowlist only. nik:',
        employee.nik
      );
    }
    const accessLevel = determineAccessLevel({
      nik: employee.nik,
      dept_id: employee.dept_id,
      position: employee.position,
    });
    console.log('[Login API] Access level determined:', accessLevel);

    // 5. Create session with all data
    const session: SessionData = {
      access_token,
      user,
      employee: {
        id: employee.id,
        uuid: employeeUuid,  // Use UUID fetched from either timetrack or MySQL API
        nik: employee.nik || '',
        full_name: employee.full_name || employee.name || '',
        nickname: employee.nickname || employee.name || '',
        position: employee.position || '',
        dept_id: employee.dept_id || 0,
        department_name,
        photo: employee.photo || ''
      },
      access: {
        level: accessLevel,
        can_view_all: accessLevel === 'full',
        can_view_own_only: accessLevel === 'restricted'
      }
    };

    console.log('[Login API] Final session employee UUID:', session.employee.uuid);

    // 6. Set session cookie
    await createSession(session);
    timing.phase("session_creation");

    // Return session data (without sensitive token in response body)
    const sessionResponse = {
      user: session.user,
      employee: session.employee,
      access: session.access,
    };

    timing.total({ result: "success" });
    return NextResponse.json({
      success: true,
      data: sessionResponse
    });

  } catch (error) {
    timing.total({ result: "error" });
    console.error('[Login API] Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
