/**
 * Export Projects Excel API Route
 * GET /api/export/projects/excel
 *
 * Export project status and budget information to Excel format with multiple sheets
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getExportAccessFilter, getExportMetadata } from '@/lib/export/permissions';
import { exportProjectsToExcel, generateExcelFilename } from '@/lib/export/excel-export';
import type { ProjectExportData } from '@/lib/export/csv-export';
import {
  fetchAssignmentsWithDetails,
  fetchAllCampaigns,
} from '@/lib/export/data-fetcher';

/**
 * GET /api/export/projects/excel
 * Export project report to Excel
 */
export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    // Read but not applied — same limitation as the CSV variant, and likewise
    // omitted from this export's entry in lib/export/applied-filters.ts.
    const brandIds = searchParams.get('brandIds');
    const projectIds = searchParams.get('projectIds');
    const groupByBrand = searchParams.get('groupByBrand') !== 'false';
    const includeSummary = searchParams.get('includeSummary') !== 'false';

    // Get access filter (for projects, full access vs restricted doesn't matter much as we show all)
    await getExportAccessFilter();

    // Fetch assignments first to get actual project_uuids that have data
    const allAssignments = await fetchAssignmentsWithDetails({}, request);

    console.log('[Export Projects Excel] Fetched assignments:', allAssignments.length);

    if (allAssignments.length === 0) {
      // Return empty Excel with just headers
      console.log('[Export Projects Excel] No assignments found, returning empty Excel');
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Summary');
      worksheet.addRow(['No project data found']);
      worksheet.addRow(['Try adjusting your filters or check if assignments exist.']);
      const buffer = await workbook.xlsx.writeBuffer();
      return new NextResponse(new Uint8Array(Buffer.from(buffer)), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${generateExcelFilename('projects-report')}"`,
        },
      });
    }

    // Get unique project_uuids from assignments
    const uniqueProjectUuids = [...new Set(allAssignments.map(a => a.project_uuid).filter(Boolean) as string[])];

    console.log('[Export Projects Excel] Unique project_uuids from assignments:', uniqueProjectUuids.length);

    // OPTIMIZATION: Use campaign data that's already fetched in fetchAssignmentsWithDetails
    // instead of fetching ALL campaigns again
    const campaigns: any[] = [];

    // First, extract campaign data from assignments (already fetched)
    const existingCampaignMap = new Map<string, any>();
    for (const assignment of allAssignments) {
      if (assignment.project && !existingCampaignMap.has(assignment.project_uuid)) {
        existingCampaignMap.set(assignment.project_uuid, assignment.project);
        campaigns.push(assignment.project);
      }
    }

    console.log('[Export Projects Excel] Campaigns from assignments:', campaigns.length);

    // Identify missing campaigns (project_uuids without campaign data)
    const missingProjectUuids = uniqueProjectUuids.filter(uuid => !existingCampaignMap.has(uuid));
    console.log('[Export Projects Excel] Missing campaigns:', missingProjectUuids.length);

    // Fetch only missing campaigns
    if (missingProjectUuids.length > 0) {
      const { fetchCampaignsByUUIDs, fetchAllBrands } = await import('@/lib/export/data-fetcher');
      const brandMap = await fetchAllBrands(request);
      const missingCampaigns = await fetchCampaignsByUUIDs(missingProjectUuids, request, brandMap);
      campaigns.push(...missingCampaigns);
      console.log('[Export Projects Excel] Fetched missing campaigns:', missingCampaigns.length);
    }

    console.log('[Export Projects Excel] Total campaigns available:', campaigns.length);

    // Build a map of campaign UUIDs to campaign data for quick lookup
    const campaignMap = new Map<string, typeof campaigns[0]>();
    for (const campaign of campaigns) {
      campaignMap.set(campaign.uuid, campaign);
    }

    // Build export data from projects that have assignments
    const exportDataMap = new Map<string, ProjectExportData>();

    for (const projectUuid of uniqueProjectUuids) {
      const campaign = campaignMap.get(projectUuid);

      // Get assignments for this project
      const projectAssignments = allAssignments.filter(
        a => a.project_uuid === projectUuid
      );

      // Calculate unique resources and total assigned hours
      const uniqueResources = new Set(projectAssignments.map(a => a.employee_uuid));
      let totalAssignedHours = 0;

      for (const assignment of projectAssignments) {
        const hoursPerDay = assignment.hours_per_day;
        const startDate = new Date(assignment.start_date);
        const endDate = new Date(assignment.end_date);
        const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        totalAssignedHours += hoursPerDay * days;
      }

      // Use campaign data if available, otherwise use assignment data
      const projectName = campaign?.campaign_name || projectAssignments[0]?.project?.campaign_name || `Project ${projectUuid.substring(0, 8)}`;
      const brandName = campaign?.brand_name || campaign?.company_name || projectAssignments[0]?.project?.brand_name || 'Unknown';

      exportDataMap.set(projectUuid, {
        projectName,
        projectNumber: campaign?.io_number || projectAssignments[0]?.project?.io_number || null,
        projectUuid,
        brandName,
        status: campaign?.state === 'publish' ? 'Active' :
                campaign?.state === 'draft' ? 'Draft' : 'Archived',
        budget: campaign?.budget || null,
        currency: campaign?.currency || 'IDR',
        startDate: campaign?.start_date || null,
        endDate: campaign?.end_date || null,
        allocatedResources: uniqueResources.size,
        totalAssignedHours: Math.round(totalAssignedHours),
        ioNumber: campaign?.io_number || null,
      });
    }

    // Apply project filter if specified
    let filteredData = Array.from(exportDataMap.values());
    if (projectIds) {
      const projectIdArray = projectIds.split(',');
      filteredData = filteredData.filter(p => projectIdArray.includes(p.projectUuid));
    }

    if (filteredData.length === 0) {
      // Return empty Excel with just headers
      console.log('[Export Projects Excel] No project data found after filtering, returning empty Excel');
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Summary');
      worksheet.addRow(['No projects found for the specified filters']);
      const buffer = await workbook.xlsx.writeBuffer();
      return new NextResponse(new Uint8Array(Buffer.from(buffer)), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${generateExcelFilename('projects-report')}"`,
        },
      });
    }

    // Generate Excel
    const buffer = await exportProjectsToExcel({
      projects: filteredData,
      groupByBrand,
      includeSummary,
    });

    // Get export metadata
    const metadata = await getExportMetadata();

    // Generate filename
    const filename = generateExcelFilename('projects-report');

    // Return Excel file
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Export-Metadata': JSON.stringify(metadata),
      },
    });
  } catch (error) {
    console.error('[API /export/projects/excel] Export failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export projects to Excel' },
      { status: 500 }
    );
  }
}
