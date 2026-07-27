/**
 * Export Projects API Route
 * GET /api/export/projects
 *
 * Export project status and budget information to CSV format
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getExportAccessFilter, getExportMetadata } from '@/lib/export/permissions';
import { exportProjectsToCSV, generateExportFilename } from '@/lib/export/csv-export';
import {
  fetchAssignmentsWithDetails,
  fetchAllCampaigns,
} from '@/lib/export/data-fetcher';

/**
 * GET /api/export/projects
 * Export project report to CSV
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
    const brandIds = searchParams.get('brandIds');
    const projectIds = searchParams.get('projectIds');
    const format = searchParams.get('format') || 'csv';

    if (format !== 'csv') {
      return NextResponse.json(
        { error: 'Use /api/export/projects/excel for Excel format' },
        { status: 400 }
      );
    }

    // Get access filter (for projects, full access vs restricted doesn't matter much as we show all)
    await getExportAccessFilter();

    // Fetch assignments first to get actual project_uuids that have data
    const allAssignments = await fetchAssignmentsWithDetails({}, request);

    console.log('[Export Projects] Fetched assignments:', allAssignments.length);

    if (allAssignments.length === 0) {
      // Return empty CSV with headers instead of 404
      console.log('[Export Projects] No assignments found, returning empty CSV');
      const emptyCsv = 'Project Name,Project Number,Project ID,Brand,Status,Budget,Currency,Start Date,End Date,Allocated Resources,Total Assigned Hours,IO Number\n';
      return new NextResponse(emptyCsv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${generateExportFilename('projects', 'csv')}"`,
        },
      });
    }

    // Get unique project_uuids from assignments
    const uniqueProjectUuids = [...new Set(allAssignments.map(a => a.project_uuid).filter(Boolean) as string[])];

    console.log('[Export Projects] Unique project_uuids from assignments:', uniqueProjectUuids.length);

    // Fetch campaigns to get project details
    const campaigns = await fetchAllCampaigns(request);

    console.log('[Export Projects] Fetched campaigns from API:', campaigns.length);

    // Build a map of campaign UUIDs to campaign data for quick lookup
    const campaignMap = new Map<string, typeof campaigns[0]>();
    for (const campaign of campaigns) {
      campaignMap.set(campaign.uuid, campaign);
    }

    // Log which project_uuids from assignments don't have matching campaigns
    const unmatchedProjects = uniqueProjectUuids.filter(uuid => !campaignMap.has(uuid));
    if (unmatchedProjects.length > 0) {
      console.warn('[Export Projects] project_uuids in assignments without matching campaigns:', unmatchedProjects);
    }

    // Build export data from campaigns that have assignments
    const exportData: any[] = [];

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

      exportData.push({
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

    // brandIds is accepted but NOT applied: exportData is assignments-based and
    // carries no brand_id to filter on. Because it is not honored, it is absent
    // from this export's entry in lib/export/applied-filters.ts, so the dialog
    // neither sends it nor tells the user a brand filter was applied.
    let filteredData = exportData;
    if (brandIds) {
      console.log('[Export Projects] Brand filter specified but not implemented for assignments-based approach');
    }

    // Apply project filter if specified
    if (projectIds) {
      const projectIdArray = projectIds.split(',');
      filteredData = exportData.filter(p => projectIdArray.includes(p.projectUuid));
    }

    if (filteredData.length === 0) {
      // Return empty CSV with headers instead of 404
      console.log('[Export Projects] No project data found after filtering, returning empty CSV');
      const emptyCsv = 'Project Name,Project Number,Project ID,Brand,Status,Budget,Currency,Start Date,End Date,Allocated Resources,Total Assigned Hours,IO Number\n';
      return new NextResponse(emptyCsv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${generateExportFilename('projects', 'csv')}"`,
        },
      });
    }

    // Generate CSV
    const csvContent = exportProjectsToCSV(filteredData);

    // Get export metadata
    const metadata = await getExportMetadata();

    // Generate filename
    const filename = generateExportFilename('projects', 'csv');

    // Return CSV file
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Export-Metadata': JSON.stringify(metadata),
      },
    });
  } catch (error) {
    console.error('[API /export/projects] Export failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export projects' },
      { status: 500 }
    );
  }
}
