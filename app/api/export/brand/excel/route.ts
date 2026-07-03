/**
 * Export Brand Report Excel API Route
 * GET /api/export/brand/excel
 *
 * One row per (brand, employee, project type): Brand | Employee | Hours | Type.
 * Hours are the summed monthly planned allocations clipped to the requested
 * date range; Type is the project's source type (campaign/pitch).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getExportMetadata } from '@/lib/export/permissions';
import {
  exportBrandReportToExcel,
  generateExcelFilename,
  type BrandReportRow,
} from '@/lib/export/excel-export';
import { hasFullAccess, getCurrentEmployeeUUID } from '@/lib/export/data-fetcher';
import { getEngagements } from '@/lib/assignments/assignment-reads';
import { plannerDirectoryRepository } from '@/lib/planner-directory/repository';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const brandIds = searchParams.get('brandIds');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      );
    }

    // Non-admin users only see their own assignments
    const canExportAll = await hasFullAccess();
    let effectiveEmployeeUUID: string | undefined;
    if (!canExportAll) {
      effectiveEmployeeUUID = (await getCurrentEmployeeUUID()) || undefined;
    }

    const [{ engagements, allocations }, projects, employees, brands] = await Promise.all([
      getEngagements({
        employee_uuid: effectiveEmployeeUUID,
        rangeStart: startDate,
        rangeEnd: endDate,
      }),
      plannerDirectoryRepository.listProjects(),
      plannerDirectoryRepository.listEmployees(),
      plannerDirectoryRepository.listBrands(),
    ]);

    const projectByKey = new Map(projects.map((p) => [p.projectKey, p]));
    const employeeByUuid = new Map(employees.map((e) => [e.employeeUuid, e]));
    // listProjects() reads planner_projects directly, where brand_name is not
    // stored (it comes from a JOIN elsewhere) — resolve names via brands.
    const brandNameById = new Map(brands.map((b) => [b.brandId, b.name]));

    const hoursByAssignment = new Map<string, number>();
    for (const alloc of allocations) {
      hoursByAssignment.set(
        alloc.assignment_uuid,
        (hoursByAssignment.get(alloc.assignment_uuid) || 0) + (Number(alloc.planned_hours) || 0)
      );
    }

    const brandIdFilter = brandIds ? new Set(brandIds.split(',')) : null;

    // Aggregate hours per (brand, employee, project type). Brands are keyed by
    // id where available so two distinct brands sharing a name don't merge.
    const aggregated = new Map<string, BrandReportRow>();
    for (const engagement of engagements) {
      const project = projectByKey.get(engagement.project_key);
      if (brandIdFilter && (!project?.brandId || !brandIdFilter.has(project.brandId))) {
        continue;
      }
      // project_key is "<sourceType>:<id>", so the prefix is the fallback
      const type = project?.sourceType || engagement.project_key.split(':')[0] || 'unknown';
      const key = `${project?.brandId || 'unknown'}|${engagement.employee_uuid}|${type}`;
      const hours = hoursByAssignment.get(engagement.assignment_uuid) || 0;
      const existing = aggregated.get(key);
      if (existing) {
        existing.hours += hours;
      } else {
        aggregated.set(key, {
          brand:
            (project?.brandId && brandNameById.get(project.brandId)) ||
            project?.brandName ||
            'Unknown Brand',
          employee:
            employeeByUuid.get(engagement.employee_uuid)?.fullName || 'Unknown Employee',
          hours,
          type,
        });
      }
    }
    const rows = [...aggregated.values()].map((row) => ({
      ...row,
      hours: Math.round(row.hours * 10) / 10,
    }));

    console.log('[Export Brand Excel] Engagements:', engagements.length, 'rows:', rows.length);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No brand report data found for the selected criteria.' },
        { status: 404 }
      );
    }

    const buffer = await exportBrandReportToExcel(rows);
    const metadata = await getExportMetadata();
    const filename = generateExcelFilename('brand-report', { start: startDate, end: endDate });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Export-Metadata': JSON.stringify(metadata),
      },
    });
  } catch (error) {
    console.error('[API /export/brand/excel] Export failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export brand report' },
      { status: 500 }
    );
  }
}
