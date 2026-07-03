"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { FilterPanel } from "@/components/filters/FilterPanel";
import { SetupManager } from "@/components/setup/SetupManager";
import { Timeline } from "@/components/timeline-v2";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@iconify/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExportButton } from "@/components/export";
import { useAuth } from "@/context/AuthContext";
import { canAccessDashboard, isFullAccess } from "@/lib/auth/client-access";
import { useDebounce } from "@/hooks/use-debounce";
import {
  useDepartments,
  usePlannerFilterBrands,
  usePlannerFilterProjects,
} from "@/lib/query/hooks";
import { XIcon } from "lucide-react";
import { hasBrandCriteria, hasProjectCriteria } from "@/lib/query/filterCriteria";
import type { ProjectOption } from "@/lib/query/hooks/useProjects";
import type { Brand } from "@/lib/query/hooks/useBrands";
import { useFilterPreviewStore } from "@/lib/timeline-v2/filter-preview-store";
import { useTimelineViewStore } from "@/lib/timeline-v2/view-store";
import { getTimelineExportDateRange } from "@/lib/timeline-v2/date-range";
import { countMatchingEmployees } from "@/lib/timeline-v2/count-matching-employees";
import { DASHBOARD_FEATURE_ENABLED } from "@/lib/dashboard/feature-flag";

interface HomeClientProps {
  initialTimelineAnchor: string;
  children?: ReactNode;
}

type HomePlannerFilters = {
  brandIds: string[];
  departments: string[];
  searchQuery: string;
  projectIds: string[];
};

const HomePlannerContext = createContext<HomePlannerFilters | null>(null);

function useHomePlannerFilters() {
  const filters = useContext(HomePlannerContext);
  if (!filters) {
    throw new Error("Home planner timeline must render inside HomeClient");
  }

  return filters;
}

export function HomePlannerTimeline({
  initialTimelineAnchor,
}: {
  initialTimelineAnchor: string;
}) {
  const filters = useHomePlannerFilters();

  useEffect(() => {
    console.info("[Timing]", {
      flow: "planner_startup",
      phase: "timeline_shell_mount",
      durationMs: Math.round(performance.now()),
    });
  }, []);

  return (
    <Timeline
      initialTimelineAnchor={initialTimelineAnchor}
      brandIds={filters.brandIds}
      departments={filters.departments}
      searchQuery={filters.searchQuery}
      projectIds={filters.projectIds}
    />
  );
}

export function HomeClient({
  initialTimelineAnchor,
  children,
}: HomeClientProps) {
  const { session, logout } = useAuth();
  const hasFullAccess = isFullAccess(session);
  const hasDashboardAccess = canAccessDashboard(session);

  // Export defaults follow the timeline's visible range, snapped to whole
  // months so the export dialog's month-grid picker can represent it.
  const timelineViewMode = useTimelineViewStore((state) => state.viewMode);
  const timelineAnchorDate = useTimelineViewStore((state) => state.anchorDate);
  const timelineCustomRange = useTimelineViewStore((state) => state.customRange);
  const timelineExportRange = getTimelineExportDateRange({
    // The store anchor stays null until the user navigates (see Timeline.tsx),
    // so mirror the timeline's own fallback to the server-provided anchor.
    anchorDate: timelineAnchorDate ?? new Date(`${initialTimelineAnchor}T00:00:00`),
    viewMode: timelineViewMode,
    customRange: timelineCustomRange,
  });

  // APPLIED ids flow to the timeline context; DRAFT objects live inside the
  // FilterPanel until the user hits Apply.
  const [appliedBrandIds, setAppliedBrandIds] = useState<string[]>([]);
  const [appliedProjectIds, setAppliedProjectIds] = useState<string[]>([]);
  const [appliedDepartmentIds, setAppliedDepartmentIds] = useState<string[]>([]);

  const [draftBrands, setDraftBrands] = useState<Brand[]>([]);
  const [draftProjects, setDraftProjects] = useState<ProjectOption[]>([]);
  const [draftDepartmentIds, setDraftDepartmentIds] = useState<string[]>([]);

  const [panelOpen, setPanelOpen] = useState(false);

  const [brandSearch, setBrandSearch] = useState("");
  const debouncedBrandSearch = useDebounce(brandSearch, 300);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [isSetupOpen, setIsSetupOpen] = useState(false);

  const [projectSearch, setProjectSearch] = useState("");
  const debouncedProjectSearch = useDebounce(projectSearch, 300);
  const { data: departments = [] } = useDepartments();

  // Infinite filter catalogs: search and brand scope are server-side, so the
  // dropdown payload stays bounded as the directory grows. The project column
  // pre-fills from the selected brands' projects when the user hasn't typed;
  // typing searches every project (ignoring brand scope) so any project is findable.
  const brandQuery = usePlannerFilterBrands({ search: debouncedBrandSearch });
  const draftBrandIds = useMemo(() => draftBrands.map((b) => b.id), [draftBrands]);
  const projectSearchActive = projectSearch.trim().length > 0;
  const projectQuery = usePlannerFilterProjects({
    // Typing searches every project; otherwise the column previews the selected brands' projects.
    brandIds: projectSearchActive ? [] : draftBrandIds,
    search: debouncedProjectSearch,
  });

  // True while typed input hasn't yet produced settled results — covers the
  // 300ms debounce window AND the in-flight fetch — so the dropdown shows
  // "Searching…" instead of flickering to "No results".
  const brandSearchPending =
    brandSearch.trim() !== debouncedBrandSearch.trim() || brandQuery.isFetching;
  const projectSearchPending =
    projectSearch.trim() !== debouncedProjectSearch.trim() || projectQuery.isFetching;

  // Single source of truth for "show results vs the empty hint", computed from
  // the SAME canonical scope ids the hooks gate `enabled` on (never the brand
  // name) so the fetch decision and the display decision cannot disagree.
  // Search uses the IMMEDIATE value so the dropdown shows "Searching…" during
  // the debounce window instead of flickering back to the hint.
  const brandHasQuery = hasBrandCriteria(brandSearch);
  const projectHasQuery = hasProjectCriteria({
    search: projectSearch,
    brandIds: projectSearchActive ? [] : draftBrandIds,
    status: null,
    sourceType: null,
  });

  const projectCaption = useMemo(() => {
    if (projectSearchActive || draftBrands.length === 0) return null;
    const names = draftBrands.map((b) => b.name);
    return names.length <= 2 ? `in ${names.join(", ")}` : `in ${names.length} brands`;
  }, [projectSearchActive, draftBrands]);

  useEffect(() => {
    console.info("[Timing]", {
      flow: "planner_startup",
      phase: "shell_mount",
      durationMs: Math.round(performance.now()),
    });
  }, []);

  const plannerFilters = useMemo<HomePlannerFilters>(
    () => ({
      brandIds: appliedBrandIds,
      departments: appliedDepartmentIds,
      searchQuery: debouncedSearch,
      projectIds: appliedProjectIds,
    }),
    [appliedBrandIds, appliedDepartmentIds, appliedProjectIds, debouncedSearch]
  );

  const previewDataset = useFilterPreviewStore((state) => state.dataset);
  const draftMatchCount = useMemo(() => {
    if (!previewDataset) return null;
    return countMatchingEmployees(previewDataset, {
      brandIds: draftBrands.map((b) => b.id),
      projectIds: draftProjects.map((p) => p.id),
      departmentIds: draftDepartmentIds,
    });
  }, [previewDataset, draftBrands, draftProjects, draftDepartmentIds]);

  const brands = useMemo(
    () => brandQuery.data?.pages.flatMap((page) => page.brands) ?? [],
    [brandQuery.data]
  );
  const brandTotal = brandQuery.data?.pages[0]?.total ?? brands.length;
  const projects = useMemo(
    () => projectQuery.data?.pages.flatMap((page) => page.projects) ?? [],
    [projectQuery.data]
  );
  const projectTotal = projectQuery.data?.pages[0]?.total ?? projects.length;

  // Toggle handlers resolve the emitted option id to the full Brand/Project
  // object from the loaded pages, so the draft holds the objects the chips and
  // apply step need. Selections live in the draft until Apply.
  const handleToggleBrandId = useCallback((optionId: string, checked: boolean) => {
    setDraftBrands((prev) => {
      if (checked) {
        if (prev.some((b) => b.id === optionId)) return prev;
        const found = brands.find((b) => b.id === optionId);
        return found ? [...prev, found] : prev;
      }
      return prev.filter((b) => b.id !== optionId);
    });
  }, [brands]);

  const handleToggleProjectId = useCallback((optionId: string, checked: boolean) => {
    setDraftProjects((prev) => {
      if (checked) {
        if (prev.some((p) => p.id === optionId)) return prev;
        const found = projects.find((p) => p.id === optionId);
        return found ? [...prev, found] : prev;
      }
      return prev.filter((p) => p.id !== optionId);
    });
  }, [projects]);

  const handleToggleDepartment = useCallback((id: string, checked: boolean) => {
    setDraftDepartmentIds((prev) => checked ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((d) => d !== id));
  }, []);

  const handleApplyFilters = useCallback(() => {
    setAppliedBrandIds(draftBrands.map((b) => b.id));
    setAppliedProjectIds(draftProjects.map((p) => p.id));
    setAppliedDepartmentIds(draftDepartmentIds);
    setPanelOpen(false);
  }, [draftBrands, draftProjects, draftDepartmentIds]);

  const handleClearAll = useCallback(() => {
    setDraftBrands([]); setDraftProjects([]); setDraftDepartmentIds([]);
  }, []);

  return (
    <HomePlannerContext.Provider value={plannerFilters}>
      <div className="flex flex-col h-screen bg-background">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 p-4 border-b bg-card" data-testid="filter-bar">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search people…"
              className="h-9 w-[220px]"
              data-testid="timeline-search-input"
            />
            <FilterPanel
              open={panelOpen}
              onOpenChange={setPanelOpen}
              draft={{ brands: draftBrands, projects: draftProjects, departmentIds: draftDepartmentIds }}
              appliedCount={appliedBrandIds.length + appliedProjectIds.length + appliedDepartmentIds.length}
              matchCount={draftMatchCount}
              brandFeed={{
                options: brands.map((b) => ({ id: b.id, label: b.name, sublabel: b.companyName })),
                search: brandSearch, onSearchChange: setBrandSearch, hasQuery: brandHasQuery,
                isLoading: brandSearchPending && !brandQuery.isFetchingNextPage,
                hasMore: !!brandQuery.hasNextPage, isFetchingNextPage: brandQuery.isFetchingNextPage,
                onLoadMore: () => brandQuery.fetchNextPage(), total: brandTotal,
              }}
              projectFeed={{
                options: projects.map((p) => ({ id: p.id, label: p.name, sublabel: p.brandName })),
                search: projectSearch, onSearchChange: setProjectSearch, hasQuery: projectHasQuery,
                isLoading: projectSearchPending && !projectQuery.isFetchingNextPage,
                hasMore: !!projectQuery.hasNextPage, isFetchingNextPage: projectQuery.isFetchingNextPage,
                onLoadMore: () => projectQuery.fetchNextPage(), total: projectTotal,
              }}
              projectCaption={projectCaption}
              departments={departments}
              onToggleBrand={handleToggleBrandId}
              onToggleProject={handleToggleProjectId}
              onToggleDepartment={handleToggleDepartment}
              onRemoveBrand={(id) => setDraftBrands((prev) => prev.filter((b) => b.id !== id))}
              onRemoveProject={(id) => setDraftProjects((prev) => prev.filter((p) => p.id !== id))}
              onRemoveDepartment={(id) => setDraftDepartmentIds((prev) => prev.filter((d) => d !== id))}
              onClearAll={handleClearAll}
              onApply={handleApplyFilters}
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
            <ExportButton
              filters={{
                brandId: appliedBrandIds[0] ?? null,
                departmentId: appliedDepartmentIds[0] ?? null,
                projectId: appliedProjectIds[0] ?? null,
                startDate: timelineExportRange?.startDate,
                endDate: timelineExportRange?.endDate,
              }}
            />
            {DASHBOARD_FEATURE_ENABLED && hasDashboardAccess && (
              <Button asChild variant="outline" data-testid="open-dashboard-button">
                <Link href="/dashboard">
                  <Icon icon="lucide:layout-dashboard" className="mr-2 h-4 w-4" />
                  Dashboard
                </Link>
              </Button>
            )}
            {hasFullAccess && (
              <Button onClick={() => setIsSetupOpen(true)} variant="outline" data-testid="open-setup-button">
                <Icon icon="lucide:settings" className="mr-2 h-4 w-4" />
                Setup
              </Button>
            )}

            {/* User Menu */}
            {session && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Icon icon="lucide:user" className="h-4 w-4" />
                    <span className="hidden sm:inline">{session.employee.nickname || session.employee.full_name}</span>
                    <Icon icon="lucide:chevron-down" className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[200px]">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{session.employee.full_name}</p>
                    <p className="text-xs text-muted-foreground">{session.employee.position}</p>
                    <p className="text-xs text-muted-foreground">Dept: {session.employee.department_name}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5">
                    <p className="text-xs text-muted-foreground">
                      Access: <span className={`font-medium ${hasFullAccess ? 'text-green-600' : 'text-orange-600'}`}>
                        {hasFullAccess ? 'Full' : 'Restricted'}
                      </span>
                    </p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout}>
                    <Icon icon="lucide:log-out" className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <main className="flex-1 overflow-hidden">
          {children ?? (
            <HomePlannerTimeline initialTimelineAnchor={initialTimelineAnchor} />
          )}
        </main>

        <Dialog open={isSetupOpen} onOpenChange={setIsSetupOpen}>
          <DialogContent className="flex w-full h-[90vh] overflow-hidden p-0 gap-0" showCloseButton={false}>
            <div className="sr-only">
              <DialogTitle>Setup</DialogTitle>
              <DialogDescription>
                Manage your brands and team resources.
              </DialogDescription>
            </div>
            <DialogClose className="absolute right-4 top-4 z-[70] inline-flex size-10 items-center justify-center rounded-xl border-2 border-border/80 bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
              <XIcon className="size-4" />
              <span className="sr-only">Close setup</span>
            </DialogClose>
            <SetupManager />
          </DialogContent>
        </Dialog>
      </div>
    </HomePlannerContext.Provider>
  );
}
