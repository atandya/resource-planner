"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FilterColumn, type FilterColumnOption } from "@/components/filters/FilterColumn";
import { useDebounce } from "@/hooks/use-debounce";
import { usePlannerFilterBrands } from "@/lib/query/hooks";
import { hasBrandCriteria } from "@/lib/query/filterCriteria";
import { formatScopeSummary } from "@/lib/export/export-scope-label";

interface BrandScopeFieldProps {
  /** Committed dialog-local scope. Empty means all brands (no filter). */
  scope: FilterColumnOption[];
  onApply: (scope: FilterColumnOption[]) => void;
}

/**
 * The export dialog's editable brand scope: a form field styled like the Date
 * Range button one row above, opening the same FilterColumn the timeline's
 * FilterPanel uses. Draft + Apply, matching both neighbours.
 */
export function BrandScopeField({ scope, onApply }: BrandScopeFieldProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterColumnOption[]>(scope);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  // `enabled: open` keeps the dialog from fetching brands before the popover
  // opens; the hook additionally self-gates until the search has criteria,
  // matching the FilterPanel's type-to-search brand column.
  const brandQuery = usePlannerFilterBrands({ search: debouncedSearch }, { enabled: open });

  const options: FilterColumnOption[] = useMemo(
    () =>
      brandQuery.data?.pages.flatMap((page) =>
        page.brands.map((b) => ({ id: b.id, label: b.name, sublabel: b.companyName })),
      ) ?? [],
    [brandQuery.data],
  );
  const total = brandQuery.data?.pages[0]?.total;
  const draftIds = useMemo(() => draft.map((option) => option.id), [draft]);

  // Covers the debounce window AND the in-flight fetch, same as FilterPanel.
  const searchPending = search.trim() !== debouncedSearch.trim() || brandQuery.isFetching;

  const handleOpenChange = (next: boolean) => {
    // Draft re-seeds from the committed scope on every open, so closing
    // without Apply abandons the edit completely.
    if (next) {
      setDraft(scope);
      setSearch("");
    }
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
          data-testid="export-brand-scope-trigger"
        >
          <span className="truncate">
            {formatScopeSummary({
              names: scope.map((option) => option.label),
              allLabel: "All brands",
              countNoun: "brands",
            })}
          </span>
          <Icon icon="lucide:filter" className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="w-[360px] max-w-[92vw] p-0"
        data-testid="export-brand-scope-content"
      >
        <div className="flex flex-col">
          <div className="p-2">
            <div className="flex h-[288px] min-h-0 flex-col overflow-hidden rounded-md border bg-muted/30">
              <FilterColumn
                testidPrefix="export-brand-scope"
                title="Brands"
                icon="lucide:building-2"
                options={options}
                selectedIds={draftIds}
                selectedOptions={draft}
                total={total}
                search={{ value: search, onChange: setSearch, placeholder: "Search…" }}
                hasQuery={hasBrandCriteria(search)}
                isLoading={searchPending && !brandQuery.isFetchingNextPage}
                hasMore={!!brandQuery.hasNextPage}
                isFetchingNextPage={brandQuery.isFetchingNextPage}
                onLoadMore={() => brandQuery.fetchNextPage()}
                onToggle={handleToggle}
                emptyHint="Type to search brands — empty means all brands"
                noResults="No brands found"
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
              data-testid="export-brand-scope-clear"
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
              data-testid="export-brand-scope-apply"
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
