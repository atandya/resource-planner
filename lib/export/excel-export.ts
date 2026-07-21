/**
 * Excel Export Library
 * Functions for exporting reports to Excel format with multiple sheets and formatting
 */

import ExcelJS from 'exceljs';
import { ResourceCapacityAnalysis } from '@/lib/analysis/types';
import type { ProjectExportData } from './csv-export';
import type { BrandReportRow } from './brand-report';
import type { DetailedReportRow } from './detailed-report';

// ============================================================================
// Excel Styling Constants
// ============================================================================

const HEADER_STYLE = {
  font: { bold: true, color: { argb: 'FFFFFFFF' } },
  fill: {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb: 'FF4472C4' },
  },
  border: {
    top: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
    left: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
    right: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
  },
  alignment: { horizontal: 'left' as const, vertical: 'middle' as const, wrapText: true },
};

const SUBHEADER_STYLE = {
  font: { bold: true, color: { argb: 'FFFFFFFF' } },
  fill: {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb: 'FF5B9BD5' },
  },
  border: {
    top: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
    left: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
    right: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
  },
  alignment: { horizontal: 'left' as const, vertical: 'middle' as const },
};

const CELL_STYLE = {
  border: {
    top: { style: 'thin' as const, color: { argb: 'FFE0E0E0' } },
    left: { style: 'thin' as const, color: { argb: 'FFE0E0E0' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFE0E0E0' } },
    right: { style: 'thin' as const, color: { argb: 'FFE0E0E0' } },
  },
  alignment: { horizontal: 'left' as const, vertical: 'middle' as const, wrapText: false },
};

const NUMBER_CELL_STYLE = {
  ...CELL_STYLE,
  alignment: { horizontal: 'right' as const, vertical: 'middle' as const },
  numFmt: '#,##0.00',
};

const PERCENT_CELL_STYLE = {
  ...CELL_STYLE,
  alignment: { horizontal: 'right' as const, vertical: 'middle' as const },
  numFmt: '0.0"%"',
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Apply header styling to a row
 */
function applyHeaderStyle(row: ExcelJS.Row, style: Partial<ExcelJS.Style>): void {
  row.eachCell((cell) => {
    cell.style = style;
  });
}

/**
 * Set column widths for a worksheet
 */
function setColumnWidths(worksheet: ExcelJS.Worksheet, widths: number[]): void {
  worksheet.columns = widths.map(width => ({ width }));
}

/**
 * Apply cell styling to a row (optimized - applies to entire row at once)
 */
function applyRowStyle(row: ExcelJS.Row, style: Partial<ExcelJS.Style>): void {
  row.eachCell((cell) => {
    cell.style = style;
  });
}

/**
 * Apply cell styling to a range (fallback for specific columns)
 */
function applyCellStyle(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  columnCount: number,
  style: Partial<ExcelJS.Style>
): void {
  const row = worksheet.getRow(rowNumber);
  applyRowStyle(row, style);
}

// ============================================================================
// Utilization Report Excel Export
// ============================================================================

export interface UtilizationExcelExportOptions {
  analysisData: ResourceCapacityAnalysis[];
  period: string;
  dateRange?: { start: string; end: string };
  includeSummary: boolean;
  includeDetails: boolean;
  includeTrends: boolean;
  includeAtRisk: boolean;
}

/**
 * Export utilization report to Excel with multiple sheets
 */
export async function exportUtilizationToExcel(
  options: UtilizationExcelExportOptions
): Promise<Buffer> {
  const { analysisData, period, dateRange, includeSummary, includeDetails, includeTrends, includeAtRisk } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Resource Planner';
  workbook.created = new Date();

  // Sheet 1: Summary
  if (includeSummary) {
    createSummarySheet(workbook, analysisData, period, dateRange);
  }

  // Sheet 2: Employee Detail
  if (includeDetails) {
    createDetailSheet(workbook, analysisData, period);
  }

  // Sheet 3: At Risk Resources
  if (includeAtRisk) {
    createAtRiskSheet(workbook, analysisData);
  }

  // Sheet 4: Trend Analysis
  if (includeTrends) {
    createTrendSheet(workbook, analysisData);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Create Summary Sheet
 */
function createSummarySheet(
  workbook: ExcelJS.Workbook,
  data: ResourceCapacityAnalysis[],
  period: string,
  dateRange?: { start: string; end: string }
): void {
  const worksheet = workbook.addWorksheet('Summary', { views: [{ state: 'frozen', xSplit: 0, ySplit: 2 }] });

  let currentRow = 1;

  // Report Title
  worksheet.mergeCells('A1:E1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'Resource Utilization Report';
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { horizontal: 'center' as const };

  currentRow++;

  // Report Metadata
  worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
  const metaCell = worksheet.getCell(`A${currentRow}`);
  metaCell.value = `Period: ${period}${dateRange ? ` | ${dateRange.start} to ${dateRange.end}` : ''}`;
  metaCell.alignment = { horizontal: 'center' as const };
  metaCell.font = { italic: true };

  currentRow++;

  // Overall Statistics
  const totalResources = data.length;
  const overallocatedCount = data.filter(d => d.status === 'overallocated').length;
  const underutilizedCount = data.filter(d => d.status === 'underutilized').length;
  const optimalCount = data.filter(d => d.status === 'optimal').length;
  const avgUtilization = data.reduce((sum, d) => sum + d.averageUtilization, 0) / (totalResources || 1);

  worksheet.addRow(['Total Resources', totalResources]);
  worksheet.addRow(['Overallocated', overallocatedCount]);
  worksheet.addRow(['Underutilized', underutilizedCount]);
  worksheet.addRow(['Optimal Utilization', optimalCount]);
  worksheet.addRow(['Average Utilization', `${avgUtilization.toFixed(1)}%`]);

  currentRow += 5;

  // Department Breakdown
  worksheet.getCell(`A${currentRow}`).value = 'Department Breakdown';
  worksheet.getCell(`A${currentRow}`).font = { bold: true, size: 12 };
  currentRow++;

  const deptMap = new Map<string, { count: number; avgUtil: number; overallocated: number }>();
  data.forEach(d => {
    const existing = deptMap.get(d.department) || { count: 0, avgUtil: 0, overallocated: 0 };
    existing.count++;
    existing.avgUtil += d.averageUtilization;
    if (d.status === 'overallocated') existing.overallocated++;
    deptMap.set(d.department, existing);
  });

  // Department header
  const deptHeaderRow = worksheet.addRow(['Department', 'Resources', 'Avg Utilization', 'Overallocated', 'Utilization Status']);
  applyHeaderStyle(deptHeaderRow, SUBHEADER_STYLE);

  // Department data - Bulk optimization
  const deptRows = Array.from(deptMap.entries()).map(([dept, stats]) => {
    const avgUtil = stats.avgUtil / stats.count;
    const status = avgUtil > 100 ? 'Overallocated' : avgUtil < 60 ? 'Underutilized' : 'Optimal';

    return [
      dept,
      stats.count,
      `${avgUtil.toFixed(1)}%`,
      stats.overallocated,
      status,
    ];
  });

  worksheet.addRows(deptRows);

  // Apply base style to all department rows
  const deptDataRows = worksheet.getRows(3, deptRows.length);
  if (deptDataRows) {
    deptDataRows.forEach(row => applyRowStyle(row, CELL_STYLE));
  }

  // Column widths
  setColumnWidths(worksheet, [20, 15, 15, 15, 15]);
}

/**
 * Create Employee Detail Sheet
 */
function createDetailSheet(
  workbook: ExcelJS.Workbook,
  data: ResourceCapacityAnalysis[],
  period: string
): void {
  const worksheet = workbook.addWorksheet('Employee Detail', { views: [{ state: 'frozen', ySplit: 1 }] });

  // Header
  const headerRow = worksheet.addRow([
    'Employee Name',
    'Employee ID',
    'Department',
    'Position',
    'Weekly Capacity',
    'Avg Utilization',
    'Peak Utilization',
    'Billable %',
    'Status',
    'Overallocated Days',
    'Underutilized Days',
    'Total Assigned Hours',
  ]);

  applyHeaderStyle(headerRow, HEADER_STYLE);

  // Data rows - Bulk styling optimization
  const rows = data.map(item => {
    const totalAssigned = item.dailyUtilization.reduce((sum, day) => sum + day.hoursAllocated, 0);
    return [
      item.resourceName,
      item.resourceId,
      item.department,
      item.role,
      item.weeklyCapacity,
      `${item.averageUtilization.toFixed(1)}%`,
      `${item.peakUtilization.toFixed(1)}%`,
      `${item.billablePercent.toFixed(1)}%`,
      item.status === 'overallocated' ? 'Overallocated' :
      item.status === 'underutilized' ? 'Underutilized' : 'Optimal',
      item.overallocatedDays,
      item.underutilizedDays,
      Math.round(totalAssigned),
    ];
  });

  worksheet.addRows(rows);

  // Apply base style to all data rows
  const dataRows = worksheet.getRows(2, data.length);
  if (dataRows) {
    dataRows.forEach((row) => {
      applyRowStyle(row, CELL_STYLE);
    });
  }

  // Conditional formatting for utilization
  dataRows?.forEach((row, index) => {
    const item = data[index];
    const utilCell = row.getCell(6); // Avg Utilization column
    const statusCell = row.getCell(9); // Status column

    if (item.status === 'overallocated') {
      utilCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
    } else if (item.status === 'underutilized') {
      utilCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } };
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } };
    }
  });

  // Column widths
  setColumnWidths(worksheet, [25, 15, 20, 20, 12, 12, 12, 12, 12, 15, 15, 15]);
}

/**
 * Create At Risk Resources Sheet
 */
function createAtRiskSheet(workbook: ExcelJS.Workbook, data: ResourceCapacityAnalysis[]): void {
  const worksheet = workbook.addWorksheet('At Risk Resources', { views: [{ state: 'frozen', ySplit: 1 }] });

  // Filter at-risk resources
  const atRiskData = data.filter(d => d.status !== 'optimal');

  if (atRiskData.length === 0) {
    worksheet.addRow(['No resources at risk']);
    return;
  }

  // Header
  const headerRow = worksheet.addRow([
    'Employee Name',
    'Department',
    'Status',
    'Avg Utilization',
    'Issue Type',
    'Severity',
    'Affected Days',
    'Recommendation',
  ]);

  applyHeaderStyle(headerRow, HEADER_STYLE);

  // Data rows - Bulk styling optimization
  const rows = atRiskData.map(item => {
    const issueType = item.status === 'overallocated' ? 'Overallocation' : 'Underutilization';
    const severity = item.averageUtilization > 120 || item.averageUtilization < 40 ? 'High' : 'Medium';
    const recommendation = item.status === 'overallocated'
      ? 'Reduce assignments or add resources'
      : 'Assign more projects';

    return [
      item.resourceName,
      item.department,
      item.status === 'overallocated' ? 'Overallocated' : 'Underutilized',
      `${item.averageUtilization.toFixed(1)}%`,
      issueType,
      severity,
      item.status === 'overallocated' ? item.overallocatedDays : item.underutilizedDays,
      recommendation,
    ];
  });

  worksheet.addRows(rows);

  // Apply base style to all data rows
  const dataRows = worksheet.getRows(2, atRiskData.length);
  if (dataRows) {
    dataRows.forEach(row => applyRowStyle(row, CELL_STYLE));
  }

  // Column widths
  setColumnWidths(worksheet, [25, 20, 12, 12, 12, 10, 12, 30]);
}

/**
 * Create Trend Analysis Sheet
 */
function createTrendSheet(workbook: ExcelJS.Workbook, data: ResourceCapacityAnalysis[]): void {
  const worksheet = workbook.addWorksheet('Trend Analysis');

  // Aggregate by week
  const weeklyData = new Map<string, { totalCapacity: number; totalAssigned: number; count: number }>();

  data.forEach(item => {
    item.dailyUtilization.forEach(day => {
      const date = new Date(day.date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
      const weekKey = weekStart.toISOString().split('T')[0];

      const existing = weeklyData.get(weekKey) || { totalCapacity: 0, totalAssigned: 0, count: 0 };
      existing.totalCapacity += day.hoursAvailable;
      existing.totalAssigned += day.hoursAllocated;
      existing.count++;
      weeklyData.set(weekKey, existing);
    });
  });

  // Header
  const headerRow = worksheet.addRow([
    'Week Starting',
    'Avg Utilization %',
    'Total Capacity (Hours)',
    'Total Assigned (Hours)',
    'Trend',
  ]);

  applyHeaderStyle(headerRow, HEADER_STYLE);

  // Data rows sorted by week - Bulk optimization
  const sortedWeeks = Array.from(weeklyData.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  let prevUtil = 0;

  const rows = sortedWeeks.map(([week, stats]) => {
    const avgUtil = (stats.totalAssigned / stats.totalCapacity) * 100;
    const trend = prevUtil > 0
      ? avgUtil > prevUtil + 5 ? 'Increasing' : avgUtil < prevUtil - 5 ? 'Decreasing' : 'Stable'
      : '-';

    prevUtil = avgUtil;
    return [
      week,
      `${avgUtil.toFixed(1)}%`,
      Math.round(stats.totalCapacity),
      Math.round(stats.totalAssigned),
      trend,
    ];
  });

  worksheet.addRows(rows);

  // Apply base style to all data rows
  const dataRows = worksheet.getRows(2, sortedWeeks.length);
  if (dataRows) {
    dataRows.forEach(row => applyRowStyle(row, CELL_STYLE));
  }

  // Column widths
  setColumnWidths(worksheet, [15, 15, 20, 20, 12]);
}

// ============================================================================
// Project Report Excel Export
// ============================================================================

export interface ProjectExcelExportOptions {
  projects: ProjectExportData[];
  groupByBrand?: boolean;
  includeSummary: boolean;
}

/**
 * Export project report to Excel
 */
export async function exportProjectsToExcel(
  options: ProjectExcelExportOptions
): Promise<Buffer> {
  const { projects, groupByBrand, includeSummary } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Resource Planner';
  workbook.created = new Date();

  // Summary sheet
  if (includeSummary) {
    createProjectSummarySheet(workbook, projects);
  }

  // Per-brand sheets if requested
  if (groupByBrand) {
    const brandGroups = new Map<string, ProjectExportData[]>();
    projects.forEach(p => {
      const existing = brandGroups.get(p.brandName) || [];
      existing.push(p);
      brandGroups.set(p.brandName, existing);
    });

    brandGroups.forEach((brandProjects, brandName) => {
      createBrandSheet(workbook, brandName, brandProjects);
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Create Project Summary Sheet
 */
function createProjectSummarySheet(
  workbook: ExcelJS.Workbook,
  projects: ProjectExportData[]
): void {
  const worksheet = workbook.addWorksheet('Project Summary', { views: [{ state: 'frozen', ySplit: 1 }] });

  // Header
  const headerRow = worksheet.addRow([
    'Project Name',
    'Project Number',
    'Project ID',
    'Brand',
    'Status',
    'Budget',
    'Currency',
    'Start Date',
    'End Date',
    'Allocated Resources',
    'Total Assigned Hours',
    'IO Number',
  ]);

  applyHeaderStyle(headerRow, HEADER_STYLE);

  // Data rows - Bulk optimization
  const rows = projects.map(project => [
    project.projectName,
    project.projectNumber || '',
    project.projectUuid,
    project.brandName,
    project.status,
    project.budget || 0,
    project.currency,
    project.startDate || '',
    project.endDate || '',
    project.allocatedResources,
    project.totalAssignedHours,
    project.ioNumber || '',
  ]);

  worksheet.addRows(rows);

  // Apply base style to all data rows
  const dataRows = worksheet.getRows(2, projects.length);
  if (dataRows) {
    dataRows.forEach((row, index) => {
      applyRowStyle(row, CELL_STYLE);

      // Format budget as currency
      if (projects[index].budget) {
        row.getCell(6).numFmt = '#,##0.00';
      }
    });
  }

  // Column widths
  setColumnWidths(worksheet, [30, 15, 20, 20, 12, 15, 10, 12, 12, 15, 18, 15]);
}

/**
 * Create Brand-specific Sheet
 */
function createBrandSheet(
  workbook: ExcelJS.Workbook,
  brandName: string,
  projects: ProjectExportData[]
): void {
  // Sanitize sheet name (Excel limits to 31 chars and certain characters)
  const sheetName = brandName.replace(/[\\/?*[\]]/g, '_').substring(0, 31) || 'Unknown Brand';

  const worksheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });

  // Header
  const headerRow = worksheet.addRow([
    'Project Name',
    'Project Number',
    'Status',
    'Budget',
    'Allocated Resources',
    'Total Assigned Hours',
  ]);

  applyHeaderStyle(headerRow, SUBHEADER_STYLE);

  // Data rows - Bulk optimization
  const rows = projects.map(project => [
    project.projectName,
    project.projectNumber || '',
    project.status,
    project.budget || 0,
    project.allocatedResources,
    project.totalAssignedHours,
  ]);

  worksheet.addRows(rows);

  // Apply base style to all data rows
  const dataRows = worksheet.getRows(2, projects.length);
  if (dataRows) {
    dataRows.forEach((row, index) => {
      applyRowStyle(row, CELL_STYLE);

      // Format budget as currency
      if (projects[index].budget) {
        row.getCell(4).numFmt = '#,##0.00';
      }
    });
  }

  // Column widths
  setColumnWidths(worksheet, [30, 15, 12, 15, 15, 15]);
}

// ============================================================================
// Assignments Excel Export
// ============================================================================

export interface AssignmentsExcelExportOptions {
  assignments: Array<{
    employeeName: string;
    employeeId: string;
    department: string;
    position: string;
    projectName: string;
    projectNumber: string | null;
    brandName: string;
    startDate: string;
    endDate: string;
    hoursPerDay: number;
    allocationPercentage: number | null;
    category: string | null;
    status: string;
    billable: string;
    note: string | null;
  }>;
  groupByBrand?: boolean;
  groupByDepartment?: boolean;
  includeSummary: boolean;
}

/**
 * Export assignments to Excel with multiple sheets
 */
export async function exportAssignmentsToExcel(
  options: AssignmentsExcelExportOptions
): Promise<Buffer> {
  const { assignments, groupByBrand, groupByDepartment, includeSummary } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Resource Planner';
  workbook.created = new Date();

  // Summary sheet
  if (includeSummary) {
    createAssignmentsSummarySheet(workbook, assignments);
  }

  // All Assignments sheet
  createAssignmentsDetailSheet(workbook, assignments);

  // Per-brand sheets if requested
  if (groupByBrand) {
    const brandGroups = new Map<string, typeof assignments>();
    assignments.forEach(a => {
      const existing = brandGroups.get(a.brandName) || [];
      existing.push(a);
      brandGroups.set(a.brandName, existing);
    });

    brandGroups.forEach((brandAssignments, brandName) => {
      createBrandSheetForAssignments(workbook, brandName, brandAssignments);
    });
  }

  // Per-department sheets if requested
  if (groupByDepartment) {
    const deptGroups = new Map<string, typeof assignments>();
    assignments.forEach(a => {
      const existing = deptGroups.get(a.department) || [];
      existing.push(a);
      deptGroups.set(a.department, existing);
    });

    deptGroups.forEach((deptAssignments, deptName) => {
      createDepartmentSheetForAssignments(workbook, deptName, deptAssignments);
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Create Summary Sheet for Assignments
 */
function createAssignmentsSummarySheet(
  workbook: ExcelJS.Workbook,
  assignments: AssignmentsExcelExportOptions['assignments']
): void {
  const worksheet = workbook.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 2 }] });

  let currentRow = 1;

  // Report Title
  worksheet.mergeCells('A1:E1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'Assignments Report';
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { horizontal: 'center' as const };

  currentRow++;

  // Statistics
  const totalAssignments = assignments.length;
  const totalHours = assignments.reduce((sum, a) => sum + calculateHours(a.startDate, a.endDate, a.hoursPerDay), 0);
  const billableCount = assignments.filter(a => a.billable === 'Yes').length;

  worksheet.addRow(['Total Assignments', totalAssignments]);
  worksheet.addRow(['Total Hours', Math.round(totalHours)]);
  worksheet.addRow(['Billable Assignments', billableCount]);
  worksheet.addRow(['Unique Resources', new Set(assignments.map(a => a.employeeId)).size]);
  worksheet.addRow(['Unique Projects', new Set(assignments.map(a => a.projectName)).size]);

  currentRow += 5;

  // By Brand
  const brandCounts = new Map<string, number>();
  assignments.forEach(a => {
    brandCounts.set(a.brandName, (brandCounts.get(a.brandName) || 0) + 1);
  });

  worksheet.getCell(`A${currentRow}`).value = 'By Brand';
  worksheet.getCell(`A${currentRow}`).font = { bold: true, size: 12 };

  currentRow++;

  const brandHeaderRow = worksheet.addRow(['Brand', 'Assignments']);
  applyHeaderStyle(brandHeaderRow, SUBHEADER_STYLE);

  Array.from(brandCounts.entries()).sort((a, b) => b[1] - a[1]).forEach(([brand, count]) => {
    worksheet.addRow([brand, count]);
  });

  currentRow += Array.from(brandCounts.entries()).length + 2;

  // By Department
  const deptCounts = new Map<string, number>();
  assignments.forEach(a => {
    deptCounts.set(a.department || 'Unassigned', (deptCounts.get(a.department || 'Unassigned') || 0) + 1);
  });

  worksheet.getCell(`A${currentRow}`).value = 'By Department';
  worksheet.getCell(`A${currentRow}`).font = { bold: true, size: 12 };

  currentRow++;

  const deptHeaderRow = worksheet.addRow(['Department', 'Assignments']);
  applyHeaderStyle(deptHeaderRow, SUBHEADER_STYLE);

  Array.from(deptCounts.entries()).sort((a, b) => b[1] - a[1]).forEach(([dept, count]) => {
    worksheet.addRow([dept, count]);
  });

  setColumnWidths(worksheet, [20, 15]);
}

/**
 * Create All Assignments Detail Sheet
 */
function createAssignmentsDetailSheet(
  workbook: ExcelJS.Workbook,
  assignments: AssignmentsExcelExportOptions['assignments']
): void {
  const worksheet = workbook.addWorksheet('All Assignments', { views: [{ state: 'frozen', ySplit: 1 }] });

  // Header
  const headerRow = worksheet.addRow([
    'Employee Name',
    'Employee ID',
    'Department',
    'Position',
    'Project',
    'Project Number',
    'Brand',
    'Start Date',
    'End Date',
    'Hours/Day',
    'Allocation %',
    'Category',
    'Status',
    'Billable',
    'Notes',
  ]);

  applyHeaderStyle(headerRow, HEADER_STYLE);

  // Data rows - Bulk styling optimization
  const rows = assignments.map(assignment =>
    [
      assignment.employeeName,
      assignment.employeeId,
      assignment.department,
      assignment.position,
      assignment.projectName,
      assignment.projectNumber,
      assignment.brandName,
      assignment.startDate,
      assignment.endDate,
      assignment.hoursPerDay,
      assignment.allocationPercentage || '',
      assignment.category || '',
      assignment.status,
      assignment.billable,
      assignment.note || '',
    ]
  );

  // Add all rows at once
  worksheet.addRows(rows);

  // Apply base style to all data rows in one operation
  const dataRows = worksheet.getRows(2, assignments.length);
  if (dataRows) {
    dataRows.forEach((row, index) => {
      applyRowStyle(row, CELL_STYLE);

      // Add some color coding for status
      const assignment = assignments[index];
      if (assignment.status === 'confirmed') {
        row.getCell(13).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6E0C5' } };
      } else if (assignment.status === 'pending') {
        row.getCell(13).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
      }

      // Highlight billable
      if (assignment.billable === 'Yes') {
        row.getCell(14).font = { bold: true, color: { argb: 'FF107C10' } };
      }
    });
  }

  // Column widths
  setColumnWidths(worksheet, [25, 20, 20, 20, 30, 15, 20, 12, 12, 10, 12, 15, 12, 12, 30]);
}

/**
 * Create Brand-specific Sheet for Assignments
 */
function createBrandSheetForAssignments(
  workbook: ExcelJS.Workbook,
  brandName: string,
  assignments: AssignmentsExcelExportOptions['assignments']
): void {
  // Sanitize sheet name
  const sheetName = brandName.replace(/[\\/?*[\]]/g, '_').substring(0, 31) || 'Unknown Brand';

  const worksheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });

  const headerRow = worksheet.addRow([
    'Employee Name',
    'Department',
    'Position',
    'Project',
    'Start Date',
    'End Date',
    'Hours/Day',
    'Billable',
    'Status',
  ]);

  applyHeaderStyle(headerRow, SUBHEADER_STYLE);

  // Data rows - Bulk optimization
  const rows = assignments.map(assignment => [
    assignment.employeeName,
    assignment.department,
    assignment.position,
    assignment.projectName,
    assignment.startDate,
    assignment.endDate,
    assignment.hoursPerDay,
    assignment.billable,
    assignment.status,
  ]);

  worksheet.addRows(rows);

  // Apply base style to all data rows
  const dataRows = worksheet.getRows(2, assignments.length);
  if (dataRows) {
    dataRows.forEach(row => applyRowStyle(row, CELL_STYLE));
  }

  setColumnWidths(worksheet, [25, 20, 20, 30, 12, 12, 10, 10, 12]);
}

/**
 * Create Department-specific Sheet for Assignments
 */
function createDepartmentSheetForAssignments(
  workbook: ExcelJS.Workbook,
  deptName: string,
  assignments: AssignmentsExcelExportOptions['assignments']
): void {
  // Sanitize sheet name
  const sheetName = deptName.replace(/[\\/?*[\]]/g, '_').substring(0, 31) || 'Unassigned';

  const worksheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });

  const headerRow = worksheet.addRow([
    'Employee Name',
    'Position',
    'Project',
    'Start Date',
    'End Date',
    'Hours/Day',
    'Billable',
    'Status',
  ]);

  applyHeaderStyle(headerRow, SUBHEADER_STYLE);

  // Data rows - Bulk optimization
  const rows = assignments.map(assignment => [
    assignment.employeeName,
    assignment.position,
    assignment.projectName,
    assignment.startDate,
    assignment.endDate,
    assignment.hoursPerDay,
    assignment.billable,
    assignment.status,
  ]);

  worksheet.addRows(rows);

  // Apply base style to all data rows
  const dataRows = worksheet.getRows(2, assignments.length);
  if (dataRows) {
    dataRows.forEach(row => applyRowStyle(row, CELL_STYLE));
  }

  setColumnWidths(worksheet, [25, 20, 30, 12, 12, 10, 10, 12]);
}

/**
 * Calculate hours between two dates
 */
function calculateHours(startDate: string, endDate: string, hoursPerDay: number): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return hoursPerDay * days;
}

// ============================================================================
// Conflicts Excel Export
// ============================================================================

export interface ConflictsExcelExportOptions {
  conflicts: Array<{
    resourceName: string;
    resourceId: string;
    department: string;
    conflictType: string;
    severity: string;
    date: string;
    description: string;
    affectedAssignments: number;
    suggestedResolution: string | undefined;
  }>;
  groupBySeverity?: boolean;
  groupByType?: boolean;
}

/**
 * Export conflicts report to Excel with formatting
 */
export async function exportConflictsToExcel(
  options: ConflictsExcelExportOptions
): Promise<Buffer> {
  const { conflicts, groupBySeverity, groupByType } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Resource Planner';
  workbook.created = new Date();

  // Main conflicts sheet
  createConflictsDetailSheet(workbook, conflicts);

  // Group by severity if requested
  if (groupBySeverity) {
    createConflictsBySeveritySheet(workbook, conflicts);
  }

  // Group by type if requested
  if (groupByType) {
    createConflictsByTypeSheet(workbook, conflicts);
  }

  // Summary sheet
  createConflictsSummarySheet(workbook, conflicts);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Create main conflicts detail sheet
 */
function createConflictsDetailSheet(
  workbook: ExcelJS.Workbook,
  conflicts: ConflictsExcelExportOptions['conflicts']
): void {
  const worksheet = workbook.addWorksheet('All Conflicts', { views: [{ state: 'frozen', ySplit: 1 }] });

  // Header
  const headerRow = worksheet.addRow([
    'Resource Name',
    'Resource ID',
    'Department',
    'Conflict Type',
    'Severity',
    'Date',
    'Description',
    'Affected Assignments',
    'Suggested Resolution',
  ]);

  applyHeaderStyle(headerRow, HEADER_STYLE);

  // Data rows - Bulk optimization
  const rows = conflicts.map(conflict => [
    conflict.resourceName,
    conflict.resourceId,
    conflict.department,
    conflict.conflictType,
    conflict.severity,
    conflict.date,
    conflict.description,
    conflict.affectedAssignments,
    conflict.suggestedResolution || '',
  ]);

  worksheet.addRows(rows);

  // Apply base style to all data rows
  const dataRows = worksheet.getRows(2, conflicts.length);
  if (dataRows) {
    dataRows.forEach((row, index) => {
      applyRowStyle(row, CELL_STYLE);

      // Color code by severity
      const conflict = conflicts[index];
      if (conflict.severity === 'critical') {
        row.eachCell((cell, colNumber) => {
          if (colNumber <= 8) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
          }
        });
      } else if (conflict.severity === 'warning') {
        row.eachCell((cell, colNumber) => {
          if (colNumber <= 8) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
          }
        });
      }
    });
  }

  // Column widths
  setColumnWidths(worksheet, [25, 20, 20, 18, 12, 12, 40, 15, 35]);
}

/**
 * Create conflicts summary sheet
 */
function createConflictsSummarySheet(
  workbook: ExcelJS.Workbook,
  conflicts: ConflictsExcelExportOptions['conflicts']
): void {
  const worksheet = workbook.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 2 }] });

  let currentRow = 1;

  // Report Title
  worksheet.mergeCells('A1:E1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'Resource Conflicts Report';
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { horizontal: 'center' as const };

  currentRow += 2;

  // Overall Statistics
  const totalConflicts = conflicts.length;
  const criticalCount = conflicts.filter(c => c.severity === 'critical').length;
  const warningCount = conflicts.filter(c => c.severity === 'warning').length;
  const uniqueResources = new Set(conflicts.map(c => c.resourceId)).size;

  worksheet.addRow(['Total Conflicts', totalConflicts]);
  worksheet.addRow(['Critical Conflicts', criticalCount]);
  worksheet.addRow(['Warning Conflicts', warningCount]);
  worksheet.addRow(['Affected Resources', uniqueResources]);

  currentRow += 5;

  // By Severity
  worksheet.getCell(`A${currentRow}`).value = 'Conflicts by Severity';
  worksheet.getCell(`A${currentRow}`).font = { bold: true, size: 12 };
  currentRow++;

  const severityHeaderRow = worksheet.addRow(['Severity', 'Count', 'Percentage']);
  applyHeaderStyle(severityHeaderRow, SUBHEADER_STYLE);

  const severityCounts = new Map<string, number>();
  conflicts.forEach(c => {
    severityCounts.set(c.severity, (severityCounts.get(c.severity) || 0) + 1);
  });

  severityCounts.forEach((count, severity) => {
    const percentage = ((count / totalConflicts) * 100).toFixed(1) + '%';
    worksheet.addRow([severity.charAt(0).toUpperCase() + severity.slice(1), count, percentage]);
  });

  currentRow += severityCounts.size + 2;

  // By Conflict Type
  worksheet.getCell(`A${currentRow}`).value = 'Conflicts by Type';
  worksheet.getCell(`A${currentRow}`).font = { bold: true, size: 12 };
  currentRow++;

  const typeHeaderRow = worksheet.addRow(['Conflict Type', 'Count']);
  applyHeaderStyle(typeHeaderRow, SUBHEADER_STYLE);

  const typeCounts = new Map<string, number>();
  conflicts.forEach(c => {
    typeCounts.set(c.conflictType, (typeCounts.get(c.conflictType) || 0) + 1);
  });

  Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      worksheet.addRow([type, count]);
    });

  // Column widths
  setColumnWidths(worksheet, [20, 15, 15]);
}

/**
 * Create conflicts by severity sheet
 */
function createConflictsBySeveritySheet(
  workbook: ExcelJS.Workbook,
  conflicts: ConflictsExcelExportOptions['conflicts']
): void {
  const worksheet = workbook.addWorksheet('By Severity', { views: [{ state: 'frozen', ySplit: 1 }] });

  // Header
  const headerRow = worksheet.addRow([
    'Severity',
    'Resource Name',
    'Department',
    'Date',
    'Description',
    'Suggested Resolution',
  ]);

  applyHeaderStyle(headerRow, SUBHEADER_STYLE);

  // Sort by severity (critical first)
  const sorted = [...conflicts].sort((a, b) => {
    if (a.severity === 'critical' && b.severity !== 'critical') return -1;
    if (a.severity !== 'critical' && b.severity === 'critical') return 1;
    return 0;
  });

  // Data rows
  const rows = sorted.map(conflict => [
    conflict.severity,
    conflict.resourceName,
    conflict.department,
    conflict.date,
    conflict.description,
    conflict.suggestedResolution || '',
  ]);

  worksheet.addRows(rows);

  // Apply base style
  const dataRows = worksheet.getRows(2, sorted.length);
  if (dataRows) {
    dataRows.forEach(row => applyRowStyle(row, CELL_STYLE));
  }

  setColumnWidths(worksheet, [12, 25, 20, 12, 40, 35]);
}

/**
 * Create conflicts by type sheet
 */
function createConflictsByTypeSheet(
  workbook: ExcelJS.Workbook,
  conflicts: ConflictsExcelExportOptions['conflicts']
): void {
  const worksheet = workbook.addWorksheet('By Type', { views: [{ state: 'frozen', ySplit: 1 }] });

  // Header
  const headerRow = worksheet.addRow([
    'Conflict Type',
    'Resource Name',
    'Department',
    'Severity',
    'Date',
    'Description',
  ]);

  applyHeaderStyle(headerRow, SUBHEADER_STYLE);

  // Sort by type
  const sorted = [...conflicts].sort((a, b) => a.conflictType.localeCompare(b.conflictType));

  // Data rows
  const rows = sorted.map(conflict => [
    conflict.conflictType,
    conflict.resourceName,
    conflict.department,
    conflict.severity,
    conflict.date,
    conflict.description,
  ]);

  worksheet.addRows(rows);

  // Apply base style
  const dataRows = worksheet.getRows(2, sorted.length);
  if (dataRows) {
    dataRows.forEach(row => applyRowStyle(row, CELL_STYLE));
  }

  setColumnWidths(worksheet, [20, 25, 20, 12, 12, 40]);
}

// ============================================================================
// Brand Report Excel Export
// ============================================================================

/**
 * Export brand report to Excel: one sheet, one row per (brand, employee) with
 * man-hours split across project types
 * (Brand | Employee | Campaign Hours | Pitch Hours | [Other Hours] | Total Hours).
 * The Other Hours column appears only when some hours come from an unresolved
 * project type. Rows are expected pre-sorted and pre-rounded by the caller.
 */
export async function exportBrandReportToExcel(rows: BrandReportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Resource Planner';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Brand Report', { views: [{ state: 'frozen', ySplit: 1 }] });

  const includeOther = rows.some((r) => r.otherHours > 0);

  const headers = includeOther
    ? ['Brand', 'Employee', 'Campaign Hours', 'Pitch Hours', 'Other Hours', 'Total Hours']
    : ['Brand', 'Employee', 'Campaign Hours', 'Pitch Hours', 'Total Hours'];
  const headerRow = worksheet.addRow(headers);
  applyHeaderStyle(headerRow, HEADER_STYLE);

  // Brand Report hours are rounded to 1 decimal upstream (buildBrandReportRows),
  // so this sheet formats to 1 decimal instead of the file-wide 2-decimal default.
  const hoursStyle = { ...NUMBER_CELL_STYLE, numFmt: '#,##0.0' };

  for (const row of rows) {
    const values = includeOther
      ? [row.brand, row.employee, row.campaignHours, row.pitchHours, row.otherHours, row.totalHours]
      : [row.brand, row.employee, row.campaignHours, row.pitchHours, row.totalHours];
    const dataRow = worksheet.addRow(values);
    applyRowStyle(dataRow, CELL_STYLE);
    // Numeric hour columns start at column 3.
    for (let col = 3; col <= values.length; col++) {
      dataRow.getCell(col).style = hoursStyle;
    }
  }

  const lastColumn = includeOther ? 6 : 5;
  setColumnWidths(worksheet, includeOther ? [30, 30, 15, 13, 13, 13] : [30, 30, 15, 13, 13]);

  // Header-row filter dropdowns (Excel AutoFilter; Google Sheets imports it as
  // an applied filter) so users can sort/filter each column on open.
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: worksheet.rowCount, column: lastColumn },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ============================================================================
// Detailed Data Report Excel Export
// ============================================================================

/**
 * Export the Detailed Data Report: one sheet, one row per
 * (employee, project, month) —
 * Department | Employee | Brand | Project Name | Project Type | Month | Planned Hours.
 * Rows arrive pre-sorted and pre-rounded from buildDetailedReportRows.
 *
 * Deliberately NO totals row: this is a semi-raw dataset meant to be filtered
 * and pivoted, and a totals row silently corrupts every one of those.
 */
export async function exportDetailedReportToExcel(rows: DetailedReportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Resource Planner';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Detailed Data', { views: [{ state: 'frozen', ySplit: 1 }] });

  const headerRow = worksheet.addRow([
    'Department',
    'Employee',
    'Brand',
    'Project Name',
    'Project Type',
    'Month',
    'Planned Hours',
  ]);
  applyHeaderStyle(headerRow, HEADER_STYLE);

  // Hours are rounded to 1 decimal upstream, so format to 1 decimal rather than
  // the file-wide 2-decimal default (matches the Brand Report sheet).
  const hoursStyle = { ...NUMBER_CELL_STYLE, numFmt: '#,##0.0' };
  const monthStyle = { ...CELL_STYLE, numFmt: 'mmm yyyy' };

  for (const row of rows) {
    // Month is a REAL date, not text: Excel then sorts, date-filters and
    // pivot-groups it correctly across a year boundary (Oct 2025 -> Jan 2026),
    // which text months cannot do. Built with Date.UTC because ExcelJS
    // serializes the UTC instant — a local-time constructor would land on the
    // last day of the previous month for any server east of Greenwich.
    const [year, month] = row.month.split('-').map(Number);
    const monthDate = new Date(Date.UTC(year, month - 1, 1));

    const dataRow = worksheet.addRow([
      row.department,
      row.employee,
      row.brand,
      row.projectName,
      row.projectType,
      monthDate,
      row.plannedHours,
    ]);
    applyRowStyle(dataRow, CELL_STYLE);
    // "Oct 2025" on screen, a date underneath.
    dataRow.getCell(6).style = monthStyle;
    dataRow.getCell(7).style = hoursStyle;
  }

  setColumnWidths(worksheet, [22, 26, 24, 32, 14, 12, 14]);

  // Header-row filter dropdowns (Excel AutoFilter; Google Sheets imports it as
  // an applied filter) so users can sort/filter each column on open.
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: worksheet.rowCount, column: 7 },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ============================================================================
// File Download Utility
// ============================================================================

/**
 * Generate a filename for the Excel export
 */
export function generateExcelFilename(reportType: string, dateRange?: { start: string; end: string }): string {
  const date = new Date().toISOString().split('T')[0];

  if (dateRange) {
    return `${reportType}-${dateRange.start}-to-${dateRange.end}.xlsx`;
  }

  return `${reportType}-${date}.xlsx`;
}

/**
 * Trigger browser download for Excel content
 */
export function downloadExcelFile(buffer: Buffer, filename: string): void {
  const blob = new Blob([new Uint8Array(buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
