/**
 * Which filters each export actually honors, and how to describe them.
 *
 * The export routes don't all read the same params: the Brand Report filters on
 * brandIds and ignores departmentIds/projectIds entirely, while Conflicts reads
 * only employeeIds. Listing every active timeline filter in the dialog therefore
 * overstates the scope — it tells the user a filter is applied when the route
 * throws it away.
 *
 * Keeping this beside the query builder means the dialog never has to know which
 * route reads what.
 */

import type { ExportType } from "./export-types";
import type { ExportFilters } from "./export-params";

export type ExportFilterKey = "brandIds" | "departmentIds" | "projectIds" | "employeeIds";

/**
 * Mirrors the `searchParams.get(...)` calls in each app/api/export/* route.
 * A route missing a key here means it genuinely ignores that param.
 */
const HONORED_FILTERS: Record<ExportType, readonly ExportFilterKey[]> = {
  brand: ["brandIds"],
  projects: ["brandIds", "projectIds"],
  assignments: ["projectIds"],
  utilization: ["departmentIds", "employeeIds"],
  conflicts: ["employeeIds"],
};

const FILTER_LABELS: Record<ExportFilterKey, { one: string; many: string }> = {
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

export type AppliedFilterDescription = {
  key: ExportFilterKey;
  label: string;
  value: string;
};

/**
 * Human-readable lines for the dialog's applied-filters panel.
 *
 * `names` supplies display labels where the caller has them (ids like "206" mean
 * nothing to a user); anything unnamed falls back to a plain count so the panel
 * never prints a raw id list.
 */
export function describeAppliedFilters(input: {
  exportType: ExportType;
  filters?: ExportFilters;
  names?: Partial<Record<ExportFilterKey, string[]>>;
}): AppliedFilterDescription[] {
  const honored = selectHonoredFilters(input.exportType, input.filters);

  return (Object.keys(honored) as ExportFilterKey[]).map((key) => {
    const values = honored[key] ?? [];
    const names = input.names?.[key]?.filter(Boolean) ?? [];
    const label = values.length === 1 ? FILTER_LABELS[key].one : FILTER_LABELS[key].many;
    const value =
      names.length === values.length && names.length > 0
        ? names.join(", ")
        : `${values.length} selected`;
    return { key, label, value };
  });
}
