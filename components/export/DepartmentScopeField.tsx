"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FilterColumn, type FilterColumnOption } from "@/components/filters/FilterColumn";
import { useDepartments } from "@/lib/query/hooks";
import { formatScopeSummary } from "@/lib/export/export-scope-label";

interface DepartmentScopeFieldProps {
  /** Committed dialog-local scope. Empty means all departments (no filter). */
  scope: FilterColumnOption[];
  onApply: (scope: FilterColumnOption[]) => void;
}

/**
 * The export dialog's editable department scope: the sibling of
 * BrandScopeField, same trigger/popover/draft-and-Apply shell.
 *
 * The one difference is deliberate: departments are a short, complete list, so
 * the popover is an always-visible checklist with NO search box — the same
 * FilterColumn configuration the timeline's FilterPanel uses for its own
 * department column (`search={null} hasQuery`, no pinned selectedOptions, no
 * pagination). Both places must read as one control.
 */
export function DepartmentScopeField({ scope, onApply }: DepartmentScopeFieldProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterColumnOption[]>(scope);

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
  const draftIds = useMemo(() => draft.map((option) => option.id), [draft]);

  // The committed scope is seeded once, from whatever name map the caller had
  // at that moment — which is empty if the departments query hadn't resolved,
  // leaving raw ids that rule-C memory would then preserve forever. The catalog
  // this field already holds is the authority on names, so heal the labels here
  // rather than trusting the seed. Display only: the draft keeps the raw scope.
  const displayScope = useMemo(
    () => scope.map((option) => optionById.get(option.id) ?? option),
    [scope, optionById],
  );

  const handleOpenChange = (next: boolean) => {
    // Draft re-seeds from the committed scope on every open, so closing
    // without Apply abandons the edit completely.
    if (next) setDraft(scope);
    setOpen(next);
  };

  const handleToggle = useCallback(
    (id: string, checked: boolean) => {
      setDraft((prev) => {
        if (!checked) return prev.filter((option) => option.id !== id);
        if (prev.some((option) => option.id === id)) return prev;
        const option = options.find((candidate) => candidate.id === id);
        return option ? [...prev, option] : prev;
      });
    },
    [options],
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between font-normal"
          data-testid="export-department-scope-trigger"
        >
          <span className="truncate">
            {formatScopeSummary({
              names: displayScope.map((option) => option.label),
              allLabel: "All departments",
              countNoun: "departments",
            })}
          </span>
          <Icon icon="lucide:filter" className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="w-[360px] max-w-[92vw] p-0"
        data-testid="export-department-scope-content"
      >
        <div className="flex flex-col">
          <div className="p-2">
            <div className="flex h-[288px] min-h-0 flex-col overflow-hidden rounded-md border bg-muted/30">
              <FilterColumn
                testidPrefix="export-department-scope"
                title="Departments"
                icon="lucide:users"
                caption="team"
                options={options}
                selectedIds={draftIds}
                onToggle={handleToggle}
                search={null}
                hasQuery
                isLoading={departmentsQuery.isLoading}
                noResults="No departments found"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-t bg-secondary p-2.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setDraft([])}
              data-testid="export-department-scope-clear"
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onApply(draft);
                setOpen(false);
              }}
              data-testid="export-department-scope-apply"
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
