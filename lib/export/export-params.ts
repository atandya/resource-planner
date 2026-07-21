/**
 * Shared query-string builder for export requests.
 *
 * Used by both the real export fetch and the countOnly pre-flight in
 * ExportDialog, so the record count shown in the dialog is built from the
 * exact same parameters as the file that gets downloaded.
 */

export interface ExportFilters {
  brandId?: string | null;
  departmentId?: string | null;
  projectId?: string | null;
  employeeIds?: string[];
}

export interface ExportQueryInput {
  dateRange: { start: string; end: string };
  filters?: ExportFilters;
}

export function buildExportSearchParams({ dateRange, filters }: ExportQueryInput): URLSearchParams {
  const params = new URLSearchParams();
  if (dateRange.start && dateRange.end) {
    params.append("startDate", dateRange.start);
    params.append("endDate", dateRange.end);
  }
  if (filters?.brandId) params.append("brandIds", filters.brandId);
  if (filters?.departmentId) params.append("departmentIds", filters.departmentId);
  if (filters?.projectId) params.append("projectIds", filters.projectId);
  if (filters?.employeeIds?.length) params.append("employeeIds", filters.employeeIds.join(","));
  return params;
}
