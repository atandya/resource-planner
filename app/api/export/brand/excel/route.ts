/**
 * Export Brand Report Excel API Route
 * GET /api/export/brand/excel
 *
 * One row per (brand, employee): Brand | Employee | Campaign Hours |
 * Pitch Hours | [Other Hours] | Total Hours. Hours are the summed monthly
 * planned allocations clipped to the requested date range, split by the
 * project's source type (campaign/pitch/other). Projects are disregarded —
 * an employee's hours across all of a brand's projects of a given type are summed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getExportMetadata } from '@/lib/export/permissions';
import { exportBrandReportToExcel, generateExcelFilename } from '@/lib/export/excel-export';
import { buildBrandReportRows } from '@/lib/export/brand-report';
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
    // department hook the data has. projectIds is deliberately NOT read: this
    // report is one row per (brand, employee) with projects summed across each
    // brand, so a project filter contradicts its shape.
    // lib/export/applied-filters.ts encodes that, so the dialog neither sends it
    // nor claims it was applied.
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

    const rows = buildBrandReportRows({
      engagements,
      allocations,
      projects,
      employees,
      brands,
      brandIdFilter: brandIds ? brandIds.split(',') : null,
      departmentIdFilter: departmentIds ? departmentIds.split(',') : null,
    });

    // countOnly=true: pre-flight for the export dialog's live record count.
    // Runs the same fetch + aggregation as the real export, so the count can
    // never disagree with the file. Zero rows is a valid count, not a 404.
    // Deliberately unlogged: this fires on dialog open and on every debounced
    // range change, so logging here would bury the one-line-per-export signal below.
    if (searchParams.get('countOnly') === 'true') {
      return NextResponse.json({ count: rows.length });
    }

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
