/**
 * Export Detailed Data Report Excel API Route
 * GET /api/export/detailed/excel
 *
 * One row per (employee, project, month): Department | Employee | Brand |
 * Project Name | Project Type | Month | Planned Hours — the allocation table's
 * own storage grain joined to the directory, clipped to the requested date
 * range. Semi-raw on purpose: stakeholders filter and pivot it themselves,
 * and pivoting it by (brand, employee) reproduces the Brand Report.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getExportMetadata } from '@/lib/export/permissions';
import { exportDetailedReportToExcel, generateExcelFilename } from '@/lib/export/excel-export';
import { buildDetailedReportRows } from '@/lib/export/detailed-report';
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
    // Both are comma-separated — the timeline's brand and department filters are
    // multi-select. Departments scope by the EMPLOYEE's department, the only
    // department hook the data has; projectIds is not read (see
    // lib/export/applied-filters.ts, which decides what the dialog sends and
    // what it claims was applied).
    const brandIds = searchParams.get('brandIds');
    const departmentIds = searchParams.get('departmentIds');

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

    // listProjects/listEmployees/listBrands are the shared cached directory
    // reads; listDepartments is a direct query by design (tiny table, kept out
    // of the cache for sync-safety) and supplies the Department column's names.
    const [{ engagements, allocations }, projects, employees, brands, departments] =
      await Promise.all([
        getEngagements({
          employee_uuid: effectiveEmployeeUUID,
          rangeStart: startDate,
          rangeEnd: endDate,
        }),
        plannerDirectoryRepository.listProjects(),
        plannerDirectoryRepository.listEmployees(),
        plannerDirectoryRepository.listBrands(),
        plannerDirectoryRepository.listDepartments(),
      ]);

    const rows = buildDetailedReportRows({
      engagements,
      allocations,
      projects,
      employees,
      brands,
      departments,
      brandIdFilter: brandIds ? brandIds.split(',') : null,
      departmentIdFilter: departmentIds ? departmentIds.split(',') : null,
    });

    // countOnly=true: pre-flight for the export dialog's live record count.
    // Runs the same fetch + aggregation as the real export, so the count can
    // never disagree with the file, and stops here — no xlsx render, no
    // metadata read. Zero rows is a valid count, not a 404.
    // Deliberately unlogged: this fires on dialog open and on every debounced
    // range change, so logging here would bury the one-line-per-export signal below.
    if (searchParams.get('countOnly') === 'true') {
      return NextResponse.json({ count: rows.length });
    }

    console.log('[Export Detailed Excel] Engagements:', engagements.length, 'rows:', rows.length);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No detailed report data found for the selected criteria.' },
        { status: 404 }
      );
    }

    const buffer = await exportDetailedReportToExcel(rows);
    const metadata = await getExportMetadata();
    const filename = generateExcelFilename('detailed-data-report', {
      start: startDate,
      end: endDate,
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Export-Metadata': JSON.stringify(metadata),
      },
    });
  } catch (error) {
    console.error('[API /export/detailed/excel] Export failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export detailed report' },
      { status: 500 }
    );
  }
}
