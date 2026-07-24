import { isWithinInterval, startOfDay } from "date-fns";
import type { Assignment } from "@/lib/query/hooks/useAssignments";
import type { ProjectOption } from "@/lib/query/hooks/useProjects";
// Inlined from the retired lib/timeline/resource-row-model.
function extractDeliverables(note: string | null): string[] {
  if (!note) return [];
  const match = note.match(/Deliverable[s]?:\s*([^.\n]+)/);
  if (!match) return [];
  return match[1].split(",").map((value) => value.trim()).filter(Boolean);
}

export type DeliverableProjectRow = {
  id: string;
  project: ProjectOption;
  planAssignments: Assignment[];
};

export type DeliverableGroup = {
  name: string | null;
  projects: DeliverableProjectRow[];
};

export type ProjectHighlightFilters = {
  selectedProjectIds: string[];
  selectedBrandIds: string[];
};

export function getResourceProjects(
  resourceAssignments: Assignment[],
  projects: ProjectOption[]
): ProjectOption[] {
  const projectKeys = new Set<string>();

  for (const assignment of resourceAssignments) {
    if (assignment.projectKey) {
      projectKeys.add(assignment.projectKey);
    }
  }

  return projects.filter((project) => projectKeys.has(project.projectKey));
}

export function isProjectHighlighted(
  project: ProjectOption,
  filters: ProjectHighlightFilters
): boolean {
  if (filters.selectedProjectIds.includes(project.id)) return true;
  if (project.brandId !== null && filters.selectedBrandIds.includes(project.brandId)) return true;
  return false;
}

export function isDeliverableGroupHighlighted(
  group: DeliverableGroup,
  filters: ProjectHighlightFilters
): boolean {
  return group.projects.some((row) => isProjectHighlighted(row.project, filters));
}

export function sortResourceProjects({
  projects,
  resourceAssignments,
  brandIds,
  selectedProjectIds = [],
  days,
}: {
  projects: ProjectOption[];
  resourceAssignments: Assignment[];
  brandIds: string[];
  selectedProjectIds?: string[];
  days: Date[];
}): ProjectOption[] {
  const timelineStart = days[0] ? startOfDay(days[0]) : null;
  const timelineEnd = days[days.length - 1] ? startOfDay(days[days.length - 1]) : null;

  return [...projects].sort((a, b) => {
    if (selectedProjectIds.length) {
      const aMatch = selectedProjectIds.includes(a.id);
      const bMatch = selectedProjectIds.includes(b.id);
      if (aMatch !== bMatch) return aMatch ? -1 : 1;
    }

    if (brandIds.length) {
      const aMatch = a.brandId !== null && brandIds.includes(a.brandId);
      const bMatch = b.brandId !== null && brandIds.includes(b.brandId);
      if (aMatch !== bMatch) return aMatch ? -1 : 1;
    }

    const aIsPitch = a.projectType === "pitch";
    const bIsPitch = b.projectType === "pitch";
    if (aIsPitch !== bIsPitch) return aIsPitch ? 1 : -1;

    const aHasActive = hasActiveTimelineAssignment(a.projectKey, resourceAssignments, timelineStart, timelineEnd);
    const bHasActive = hasActiveTimelineAssignment(b.projectKey, resourceAssignments, timelineStart, timelineEnd);
    if (aHasActive !== bHasActive) return aHasActive ? -1 : 1;

    const aLatest = getLatestAssignmentStart(a.projectKey, resourceAssignments);
    const bLatest = getLatestAssignmentStart(b.projectKey, resourceAssignments);
    if (aLatest && bLatest && aLatest.getTime() !== bLatest.getTime()) {
      return bLatest.getTime() - aLatest.getTime();
    }
    if (aLatest && !bLatest) return -1;
    if (!aLatest && bLatest) return 1;

    return a.name.localeCompare(b.name);
  });
}

function hasActiveTimelineAssignment(
  projectKey: string,
  assignments: Assignment[],
  timelineStart: Date | null,
  timelineEnd: Date | null
): boolean {
  if (!timelineStart || !timelineEnd) return false;

  return assignments.some(
    (assignment) =>
      assignment.projectKey === projectKey &&
      isWithinInterval(startOfDay(new Date(assignment.startDate)), {
        start: timelineStart,
        end: timelineEnd,
      })
  );
}

function getLatestAssignmentStart(
  projectKey: string,
  assignments: Assignment[]
): Date | null {
  let latest: Date | null = null;

  for (const assignment of assignments) {
    if (assignment.projectKey !== projectKey) continue;
    const assignmentStart = new Date(assignment.startDate);
    if (!latest || assignmentStart > latest) latest = assignmentStart;
  }

  return latest;
}

export function groupProjectsByDeliverable({
  sortedProjects,
  resourceAssignments,
}: {
  sortedProjects: ProjectOption[];
  resourceAssignments: Assignment[];
}): DeliverableGroup[] {
  const groupsMap = new Map<string, DeliverableProjectRow[]>();

  for (const project of sortedProjects) {
    const projectPlanAssignments = resourceAssignments.filter(
      (assignment) => assignment.projectKey === project.projectKey
    );
    const deliverableSet = new Set<string>();

    for (const assignment of projectPlanAssignments) {
      const deliverables = extractDeliverables(assignment.note);
      if (deliverables.length === 0) deliverableSet.add("__GENERAL__");
      else deliverables.forEach((deliverable) => deliverableSet.add(deliverable));
    }

    if (deliverableSet.size === 0) deliverableSet.add("__GENERAL__");

    for (const deliverableName of deliverableSet) {
      const name = deliverableName === "__GENERAL__" ? null : deliverableName;
      const planAssignments = projectPlanAssignments.filter((assignment) => {
        const deliverables = extractDeliverables(assignment.note);
        return name === null ? deliverables.length === 0 : deliverables.includes(name);
      });

      if (!groupsMap.has(deliverableName)) groupsMap.set(deliverableName, []);
      groupsMap.get(deliverableName)!.push({
        id: `${project.id}-${deliverableName}`,
        project,
        planAssignments,
      });
    }
  }

  return Array.from(groupsMap.keys())
    .sort((a, b) => {
      if (a === "__GENERAL__") return -1;
      if (b === "__GENERAL__") return 1;
      return a.localeCompare(b);
    })
    .map((deliverableName) => ({
      name: deliverableName === "__GENERAL__" ? null : deliverableName,
      projects: groupsMap.get(deliverableName)!,
    }));
}
