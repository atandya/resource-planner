"use client";

import React from "react";
import { Icon } from "@iconify/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FilterColumn, type FilterColumnOption } from "@/components/filters/FilterColumn";
import { FilterChips, type FilterChip } from "@/components/filters/FilterChips";
import { cn } from "@/lib/utils";
import type { Brand } from "@/lib/query/hooks/useBrands";
import type { ProjectOption } from "@/lib/query/hooks/useProjects";
import type { Department } from "@/lib/query/hooks/useDepartments";
import type { TimelineProjectTypeScope } from "@/lib/timeline-v2/types";

export type FilterPanelDraft = {
  brands: Brand[];
  projects: ProjectOption[];
  departmentIds: string[];
  projectTypeScope: TimelineProjectTypeScope;
};

// The type scope is a view mode, not a match criterion like the columns above:
// it decides WHICH lanes render (both / campaigns only / pitches only), so it
// gets its own strip below the table. Exactly one option is always active.
const PROJECT_TYPE_SCOPE_OPTIONS: Array<{ id: TimelineProjectTypeScope; label: string }> = [
  { id: "all", label: "All projects" },
  { id: "campaign", label: "Campaigns only" },
  { id: "pitch", label: "Pitches only" },
];

const PROJECT_TYPE_SCOPE_LABELS = new Map(PROJECT_TYPE_SCOPE_OPTIONS.map((o) => [o.id, o.label]));

type ColumnFeed = {
  options: FilterColumnOption[];
  search: string;
  onSearchChange: (v: string) => void;
  hasQuery: boolean;
  isLoading: boolean;
  hasMore: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  total: number;
};

type FilterPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: FilterPanelDraft;
  appliedCount: number;
  matchCount: number | null;
  brandFeed: ColumnFeed;
  projectFeed: ColumnFeed;
  projectCaption: string | null;     // e.g. "in Nestlé, Unilever" when pre-filled
  departments: Department[];
  onToggleBrand: (id: string, checked: boolean) => void;
  onToggleProject: (id: string, checked: boolean) => void;
  onToggleDepartment: (id: string, checked: boolean) => void;
  onProjectTypeScopeChange: (scope: TimelineProjectTypeScope) => void;
  onRemoveBrand: (id: string) => void;
  onRemoveProject: (id: string) => void;
  onRemoveDepartment: (id: string) => void;
  onClearAll: () => void;
  onApply: () => void;
};

export function FilterPanel(props: FilterPanelProps) {
  const { draft, departments } = props;
  const departmentById = React.useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);

  const chips: FilterChip[] = [
    ...draft.brands.map((b) => ({ key: `brand:${b.id}`, label: b.name, onRemove: () => props.onRemoveBrand(b.id) })),
    ...draft.projects.map((p) => ({ key: `project:${p.id}`, label: p.name, onRemove: () => props.onRemoveProject(p.id) })),
    ...(draft.projectTypeScope !== "all"
      ? [{
          key: `type-scope:${draft.projectTypeScope}`,
          label: PROJECT_TYPE_SCOPE_LABELS.get(draft.projectTypeScope) ?? draft.projectTypeScope,
          onRemove: () => props.onProjectTypeScopeChange("all"),
        }]
      : []),
    ...draft.departmentIds.map((id) => ({ key: `dept:${id}`, label: departmentById.get(id)?.name ?? id, onRemove: () => props.onRemoveDepartment(id) })),
  ];

  const departmentOptions: FilterColumnOption[] = departments.map((d) => ({ id: d.id, label: d.name }));

  return (
    <Popover open={props.open} onOpenChange={props.onOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-9 gap-2" data-testid="filter-panel-trigger">
          <Icon icon="lucide:filter" className="h-4 w-4" /> Filters
          {props.appliedCount > 0 ? (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground" data-testid="filter-panel-applied-count">
              {props.appliedCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={12} className="w-[820px] max-w-[92vw] p-0" data-testid="filter-panel-content">
        <div className="flex flex-col">
          <div className="flex h-11 shrink-0 items-center gap-1.5 overflow-x-auto border-b px-2.5" data-testid="filter-chip-strip">
            {chips.length > 0 ? (
              <FilterChips chips={chips} />
            ) : (
              <span className="text-[12px] text-muted-foreground/60">Selected filters appear here</span>
            )}
          </div>

          <div className="flex h-[288px] items-stretch gap-3 p-2">
            <div className="flex min-w-0 flex-1 overflow-hidden rounded-md border bg-muted/30" data-testid="filter-work-group">
              <div className="flex w-[210px] min-h-0 shrink-0 flex-col border-r">
                <FilterColumn
                  testidPrefix="filter-brand" title="Brands" icon="lucide:building-2"
                  options={props.brandFeed.options} selectedIds={draft.brands.map((b) => b.id)}
                  selectedOptions={draft.brands.map((b) => ({ id: b.id, label: b.name, sublabel: b.companyName }))}
                  total={props.brandFeed.total}
                  search={{ value: props.brandFeed.search, onChange: props.brandFeed.onSearchChange, placeholder: "Search…" }}
                  hasQuery={props.brandFeed.hasQuery} isLoading={props.brandFeed.isLoading}
                  hasMore={props.brandFeed.hasMore} isFetchingNextPage={props.brandFeed.isFetchingNextPage} onLoadMore={props.brandFeed.onLoadMore}
                  onToggle={props.onToggleBrand} emptyHint="Type to search brands…" noResults="No brands found"
                />
              </div>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <FilterColumn
                  testidPrefix="filter-project" title="Projects" caption={props.projectCaption}
                  options={props.projectFeed.options} selectedIds={draft.projects.map((p) => p.id)}
                  selectedOptions={draft.projects.map((p) => ({ id: p.id, label: p.name, sublabel: p.brandName }))}
                  total={props.projectFeed.total}
                  search={{ value: props.projectFeed.search, onChange: props.projectFeed.onSearchChange, placeholder: "Search…" }}
                  hasQuery={props.projectFeed.hasQuery} isLoading={props.projectFeed.isLoading}
                  hasMore={props.projectFeed.hasMore} isFetchingNextPage={props.projectFeed.isFetchingNextPage} onLoadMore={props.projectFeed.onLoadMore}
                  onToggle={props.onToggleProject} emptyHint="Pick a brand, or search all projects" noResults="No projects found"
                />
              </div>
            </div>

            <div className="flex w-[200px] min-h-0 shrink-0 overflow-hidden rounded-md border bg-muted/30" data-testid="filter-team-group">
              <FilterColumn
                testidPrefix="filter-department" title="Departments" icon="lucide:users" caption="team"
                options={departmentOptions} selectedIds={draft.departmentIds}
                onToggle={props.onToggleDepartment} search={null} hasQuery
              />
            </div>
          </div>

          <div className="flex items-center gap-3 border-t px-3 py-2" data-testid="filter-project-type-scope">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Show</span>
            <div className="flex gap-0.5 rounded-md border bg-muted/30 p-0.5" role="group" aria-label="Project type scope">
              {PROJECT_TYPE_SCOPE_OPTIONS.map((option) => {
                const active = draft.projectTypeScope === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    className={cn(
                      "h-7 rounded-sm px-2.5 text-[12px] transition-colors",
                      active ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:bg-accent"
                    )}
                    onClick={() => props.onProjectTypeScopeChange(option.id)}
                    data-testid={`filter-project-type-scope-${option.id}`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <span className="text-[11px] text-muted-foreground/70">Controls which project lanes appear on the timeline</span>
          </div>

          <div className="flex items-center justify-between gap-2 border-t bg-secondary p-2.5">
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={props.onClearAll} data-testid="filter-panel-clear">
              Clear all
            </Button>
            <Button type="button" size="sm" onClick={props.onApply} data-testid="filter-panel-apply">
              {props.matchCount === null ? "Apply" : `Show ${props.matchCount} ${props.matchCount === 1 ? "person" : "people"}`}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
