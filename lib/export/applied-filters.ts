/**
 * Which filters each export actually honors, and how to label them.
 *
 * The export routes don't all read the same params: the Brand Report filters on
 * brandIds and ignores departmentIds/projectIds entirely, while Conflicts reads
 * only employeeIds. Rendering an editor for every timeline filter would
 * overstate the scope — it tells the user a filter is applied when the route
 * throws it away, so the dialog's scope fields render only for honored keys.
 *
 * Keeping this beside the query builder means the dialog never has to know which
 * route reads what. FILTER_LABELS supplies the scope fields' form labels.
 */

import type { ExportType } from "./export-types";
import type { ExportFilters } from "./export-params";

/** Derived from ExportFilters so a new filter can't be silently dropped here. */
export type ExportFilterKey = keyof ExportFilters;

/**
 * What each app/api/export/* route actually APPLIES — which is not the same as
 * what it reads. `projects` parses brandIds and then discards it (see the
 * "not implemented" branch in app/api/export/projects/route.ts), so listing it
 * here would make the dialog claim a brand scope the file doesn't have.
 *
 * A key missing from an entry means that export ignores that filter.
 */
const HONORED_FILTERS: Record<ExportType, readonly ExportFilterKey[]> = {
  brand: ["brandIds"],
  projects: ["projectIds"],
  assignments: ["projectIds"],
  utilization: ["departmentIds", "employeeIds"],
  conflicts: ["employeeIds"],
};

export const FILTER_LABELS: Record<ExportFilterKey, { one: string; many: string }> = {
  brandIds: { one: "Brand", many: "Brands" },
  departmentIds: { one: "Department", many: "Departments" },
  projectIds: { one: "Project", many: "Projects" },
  employeeIds: { one: "Employee", many: "Employees" },
};

export function honorsFilter(exportType: ExportType, key: ExportFilterKey): boolean {
  return HONORED_FILTERS[exportType].includes(key);
}

/** Only the filters this export will actually apply, dropping the rest. */
export function selectHonoredFilters(exportType: ExportType, filters?: ExportFilters): ExportFilters {
  const honored: ExportFilters = {};
  for (const key of HONORED_FILTERS[exportType]) {
    const values = filters?.[key]?.filter(Boolean) ?? [];
    if (values.length) honored[key] = values;
  }
  return honored;
}

/** Display names keyed by filter id, so nothing depends on array positions. */
export type ExportFilterNames = Partial<Record<ExportFilterKey, Record<string, string>>>;
