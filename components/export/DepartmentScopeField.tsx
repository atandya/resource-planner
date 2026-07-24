"use client";

import { useMemo } from "react";
import { FilterColumn, type FilterColumnOption } from "@/components/filters/FilterColumn";
import { useDepartments } from "@/lib/query/hooks";
import { ExportScopePopover } from "./ExportScopePopover";

interface DepartmentScopeFieldProps {
  /** Committed dialog-local scope. Empty means all departments (no filter). */
  scope: FilterColumnOption[];
  onApply: (scope: FilterColumnOption[]) => void;
}

/**
 * The export dialog's editable department scope. Departments are a short,
 * complete catalog, so this remains a searchless checklist while sharing the
 * scope-field shell with BrandScopeField.
 */
export function DepartmentScopeField({ scope, onApply }: DepartmentScopeFieldProps) {
  // Same cached query the main page already uses, so opening the dialog costs
  // no extra fetch in the common case.
  const departmentsQuery = useDepartments();
  const departments = useMemo(() => departmentsQuery.data ?? [], [departmentsQuery.data]);

  const options: FilterColumnOption[] = useMemo(
    () => departments.map((department) => ({ id: department.id, label: department.name })),
    [departments],
  );
  const optionById = useMemo(
    () => new Map(options.map((option) => [option.id, option])),
    [options],
  );

  // The committed scope is seeded once, from whatever name map the caller had
  // at that moment. The department catalog is the authority on names, so heal
  // labels for display without mutating the committed scope.
  const displayScope = useMemo(
    () => scope.map((option) => optionById.get(option.id) ?? option),
    [scope, optionById],
  );

  return (
    <ExportScopePopover
      scope={scope}
      onApply={onApply}
      testidPrefix="export-department-scope"
      allLabel="All departments"
      countNoun="departments"
      displayScope={displayScope}
    >
      {({ selectedIds, toggleDraft }) => (
        <FilterColumn
          testidPrefix="export-department-scope"
          title="Departments"
          icon="lucide:users"
          caption="team"
          options={options}
          selectedIds={selectedIds}
          onToggle={(id, checked) => toggleDraft(id, checked, options)}
          search={null}
          hasQuery
          isLoading={departmentsQuery.isLoading}
          noResults="No departments found"
        />
      )}
    </ExportScopePopover>
  );
}
