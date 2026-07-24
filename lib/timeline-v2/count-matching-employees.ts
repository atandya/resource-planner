import type { Assignment } from "@/lib/query/hooks/useAssignments";
import type { Employee } from "@/lib/query/hooks/useEmployees";
import type { ProjectOption } from "@/lib/query/hooks/useProjects";
import { getVisibleEmployeeIds } from "@/lib/timeline-v2/visible-rows";
import type { TimelineProjectTypeScope } from "@/lib/timeline-v2/types";

export type FilterPreviewDataset = {
  employees: Employee[];
  assignments: Assignment[];
  projectByKey: Map<string, ProjectOption>;
};

export type DraftScope = {
  brandIds: string[];
  projectIds: string[];
  departmentIds: string[];
  projectTypeScope?: TimelineProjectTypeScope;
};

export function countMatchingEmployees(dataset: FilterPreviewDataset, scope: DraftScope): number {
  // Derive selectedBrandProjectKeys from the draft brand scope (empty brandIds = all brands pass).
  const selectedBrandProjectKeys = new Set(
    [...dataset.projectByKey.values()]
      .filter(
        (project) =>
          scope.brandIds.length === 0 ||
          (project.brandId !== null && scope.brandIds.includes(project.brandId))
      )
      .map((project) => project.projectKey)
  );

  return getVisibleEmployeeIds({
    employees: dataset.employees,
    assignments: dataset.assignments,
    projectByKey: dataset.projectByKey,
    selectedBrandProjectKeys,
    // TimelineFilters uses `departments` (not `departmentIds`)
    filters: {
      brandIds: scope.brandIds,
      projectIds: scope.projectIds,
      departments: scope.departmentIds,
      projectTypeScope: scope.projectTypeScope,
      searchQuery: "",
    },
  }).length;
}
