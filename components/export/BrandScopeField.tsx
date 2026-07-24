"use client";

import { useMemo, useState } from "react";
import { FilterColumn, type FilterColumnOption } from "@/components/filters/FilterColumn";
import { useDebounce } from "@/hooks/use-debounce";
import { usePlannerFilterBrands } from "@/lib/query/hooks";
import { hasBrandCriteria } from "@/lib/query/filterCriteria";
import { ExportScopePopover } from "./ExportScopePopover";

interface BrandScopeFieldProps {
  /** Committed dialog-local scope. Empty means all brands (no filter). */
  scope: FilterColumnOption[];
  onApply: (scope: FilterColumnOption[]) => void;
}

/**
 * The export dialog's editable brand scope. It keeps the timeline's lazy,
 * type-to-search brand feed, while ExportScopePopover owns the shared
 * trigger/popover/draft-and-Apply shell.
 */
export function BrandScopeField({ scope, onApply }: BrandScopeFieldProps) {
  const [scopeOpen, setScopeOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  // `enabled: scopeOpen` keeps the dialog from fetching brands before the
  // popover opens; the hook additionally self-gates until the search has
  // criteria, matching the FilterPanel's type-to-search brand column.
  const brandQuery = usePlannerFilterBrands(
    { search: debouncedSearch },
    { enabled: scopeOpen },
  );

  const options: FilterColumnOption[] = useMemo(
    () =>
      brandQuery.data?.pages.flatMap((page) =>
        page.brands.map((b) => ({ id: b.id, label: b.name, sublabel: b.companyName })),
      ) ?? [],
    [brandQuery.data],
  );
  const total = brandQuery.data?.pages[0]?.total;

  // Covers the debounce window AND the in-flight fetch, same as FilterPanel.
  const searchPending = search.trim() !== debouncedSearch.trim() || brandQuery.isFetching;

  return (
    <ExportScopePopover
      scope={scope}
      onApply={onApply}
      testidPrefix="export-brand-scope"
      allLabel="All brands"
      countNoun="brands"
      onOpen={() => setSearch("")}
      onOpenChange={setScopeOpen}
    >
      {({ draft, selectedIds, toggleDraft }) => (
        <FilterColumn
          testidPrefix="export-brand-scope"
          title="Brands"
          icon="lucide:building-2"
          options={options}
          selectedIds={selectedIds}
          selectedOptions={draft}
          total={total}
          search={{ value: search, onChange: setSearch, placeholder: "Search…" }}
          hasQuery={hasBrandCriteria(search)}
          isLoading={searchPending && !brandQuery.isFetchingNextPage}
          hasMore={!!brandQuery.hasNextPage}
          isFetchingNextPage={brandQuery.isFetchingNextPage}
          onLoadMore={() => brandQuery.fetchNextPage()}
          onToggle={(id, checked) => toggleDraft(id, checked, options)}
          emptyHint="Type to search brands — empty means all brands"
          noResults="No brands found"
        />
      )}
    </ExportScopePopover>
  );
}
