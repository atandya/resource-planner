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

/** Display names keyed by filter id, so nothing depends on array positions. */
export type ExportFilterNames = Partial<Record<ExportFilterKey, Record<string, string>>>;

/**
 * Human-readable lines for the dialog's applied-filters panel.
 *
 * `names` maps id → label where the caller has them (ids like "206" mean nothing
 * to a user). Lookup is by id rather than by position, so a partial map can
 * never pair a value with someone else's name; anything unnamed falls back to a
 * plain count rather than printing raw ids.
 */
export function describeAppliedFilters(input: {
  exportType: ExportType;
  filters?: ExportFilters;
  names?: ExportFilterNames;
}): AppliedFilterDescription[] {
  const honored = selectHonoredFilters(input.exportType, input.filters);

  return (Object.keys(honored) as ExportFilterKey[]).map((key) => {
    const values = honored[key] ?? [];
    const lookup = input.names?.[key];
    const named = values.map((id) => lookup?.[id]).filter((name): name is string => Boolean(name));
    const label = values.length === 1 ? FILTER_LABELS[key].one : FILTER_LABELS[key].many;
    const value = named.length === values.length ? named.join(", ") : `${values.length} selected`;
    return { key, label, value };
  });
}
