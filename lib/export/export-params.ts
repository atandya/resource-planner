/**
 * Shared query-string builder for export requests.
 *
 * Used by both the real export fetch and the countOnly pre-flight in
 * ExportDialog, so the record count shown in the dialog is built from the
 * exact same parameters as the file that gets downloaded.
 *
 * Every filter is a list. The export routes all parse these params with
 * `.split(",")`, so a multi-select filter must be sent whole — sending only the
 * first selection silently narrows the export to a scope the user didn't choose.
 */

export interface ExportFilters {
  brandIds?: string[];
  departmentIds?: string[];
  projectIds?: string[];
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
  appendList(params, "brandIds", filters?.brandIds);
  appendList(params, "departmentIds", filters?.departmentIds);
  appendList(params, "projectIds", filters?.projectIds);
  appendList(params, "employeeIds", filters?.employeeIds);
  return params;
}

function appendList(params: URLSearchParams, key: string, values?: string[]): void {
  const present = values?.filter(Boolean) ?? [];
  if (present.length) params.append(key, present.join(","));
}
