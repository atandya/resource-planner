import type { Employee } from "@/lib/query/hooks/useEmployees";
import { usePlannerHomeBootstrapWindow } from "@/lib/query/hooks/usePlannerHomeBootstrap";
import type { PlannerHomeBootstrapRequest, PlannerHomeBootstrapResponse } from "@/lib/query/server/planner-home-bootstrap";

type UseTimelineEmployeesInput = {
  request: PlannerHomeBootstrapRequest | undefined;
  initialBootstrap?: PlannerHomeBootstrapResponse | null;
};

const EMPTY = {
  employees: [] as PlannerHomeBootstrapResponse["employees"],
  assignments: [] as PlannerHomeBootstrapResponse["plannerTimeline"]["assignments"],
  brandsById: {} as PlannerHomeBootstrapResponse["brandsById"],
  projectsById: {} as PlannerHomeBootstrapResponse["projectsById"],
};

// ONE windowed query feeds the timeline. Brand/project/department/search are
// applied client-side over this dataset (filterTimelineEmployees), so changing
// a filter never refetches — only date/view navigation mints a new query.
export function useTimelineEmployees({ request, initialBootstrap }: UseTimelineEmployeesInput) {
  const query = usePlannerHomeBootstrapWindow(request, {
    enabled: !!request,
    initialData: initialBootstrap ?? undefined,
    initialDataUpdatedAt: initialBootstrap
      ? Date.parse(initialBootstrap.freshness.directoryFetchedAt)
      : undefined,
  });

  const data = query.data;
  const merged = data
    ? {
        employees: data.employees,
        assignments: data.plannerTimeline.assignments,
        brandsById: data.brandsById,
        projectsById: data.projectsById,
      }
    : EMPTY;

  return {
    employees: merged.employees as Employee[],
    assignments: merged.assignments,
    brandsById: merged.brandsById,
    projectsById: merged.projectsById,
    hasBootstrapData: !!data,
    isLoadingBootstrap: query.isLoading,
    isFetchingBootstrap: query.isFetching,
    isShowingPreviousBootstrap: query.isPlaceholderData,
    isBootstrapRefetchError: query.isRefetchError,
  };
}
