import { endOfMonth, format, startOfMonth } from "date-fns";
import type { Assignment } from "@/lib/query/hooks/useAssignments";
import type { Brand } from "@/lib/query/hooks/useBrands";
import type { Employee } from "@/lib/query/hooks/useEmployees";
import type { ProjectOption } from "@/lib/query/hooks/useProjects";
import { buildAllocationDayMaps } from "@/lib/timeline-v2/allocation-day-map";
import { getAllocationCellModel } from "@/lib/timeline-v2/allocation-model";
import { buildTimelinePlanDisplaySegments } from "@/lib/timeline-v2/plan-display-segments";
import type {
  TimelineAllocationCell,
  TimelineResource,
  TimelineViewMode,
} from "@/lib/timeline-v2/types";
import { getTimelineResolution } from "@/lib/timeline-v2/date-range";

export function groupTimelineAssignmentsByEmployee(assignments: Assignment[]) {
  const grouped = new Map<string, Assignment[]>();

  assignments.forEach((assignment) => {
    if (!grouped.has(assignment.employeeId)) grouped.set(assignment.employeeId, []);
    grouped.get(assignment.employeeId)!.push(assignment);
  });

  return grouped;
}

function getPlanLaneProjects(
  assignments: Assignment[],
  projectByKey: Map<string, ProjectOption>
): ProjectOption[] {
  const seenProjectKeys = new Set<string>();
  const laneProjects: ProjectOption[] = [];

  for (const assignment of assignments) {
    if (!assignment.projectKey) continue;
    if (seenProjectKeys.has(assignment.projectKey)) continue;

    const project = projectByKey.get(assignment.projectKey);
    if (!project) continue;
    if (project.projectType !== "campaign" && project.projectType !== "pitch") continue;

    seenProjectKeys.add(assignment.projectKey);
    laneProjects.push(project);
  }

  return laneProjects;
}

function isTimelineMonthRangeView(viewMode: TimelineViewMode) {
  return getTimelineResolution(viewMode) === "month";
}

// Row models depend ONLY on data + days + viewMode. Filters, lane ordering,
// highlights, and expansion are derived elsewhere (visible-rows, lane-order,
// expansion-store) so changing them never rebuilds these models.

export type ProjectLaneModel = {
  projectKey: string;
  project: ProjectOption;
  brand?: Brand;
  planAssignments: Assignment[];
  planDisplaySegments: ReturnType<typeof buildTimelinePlanDisplaySegments>;
};

export type EmployeeRowModel = {
  id: string;
  resource: TimelineResource;
  assignments: Assignment[];
  allocationCells: TimelineAllocationCell[];
  projectLanes: ProjectLaneModel[];
};

export function buildEmployeeRowModels({
  employees,
  assignments,
  projects,
  brandById,
  days,
  viewMode,
}: {
  employees: Employee[];
  assignments: Assignment[];
  projects: ProjectOption[];
  brandById: Map<string, Brand>;
  days: Date[];
  viewMode: TimelineViewMode;
}): Map<string, EmployeeRowModel> {
  const models = new Map<string, EmployeeRowModel>();
  if (days.length === 0) return models;

  const isMonthRangeView = isTimelineMonthRangeView(viewMode);
  const projectByKey = new Map(projects.map((project) => [project.projectKey, project]));
  const assignmentsByEmployee = groupTimelineAssignmentsByEmployee(assignments);
  // Month-resolution cells aggregate full calendar months, so the day map must
  // cover the month bounds, not just the visible column dates.
  const dayMaps = buildAllocationDayMaps({
    assignments,
    rangeStart: isMonthRangeView ? startOfMonth(days[0]) : days[0],
    rangeEnd: isMonthRangeView ? endOfMonth(days[days.length - 1]) : days[days.length - 1],
  });

  for (const employee of employees) {
    const resourceAssignments = assignmentsByEmployee.get(employee.id) ?? [];
    const resource: TimelineResource = {
      id: employee.id,
      name: employee.fullName,
      role: employee.position,
      department: employee.department?.name || "",
      capacity: employee.weeklyCapacity,
      employee,
    };
    const dayMap = dayMaps.get(employee.id);

    const projectLanes: ProjectLaneModel[] = [];
    for (const project of getPlanLaneProjects(resourceAssignments, projectByKey)) {
      const planAssignments = resourceAssignments.filter(
        (assignment) => assignment.projectKey === project.projectKey
      );
      const planDisplaySegments = buildTimelinePlanDisplaySegments({
        assignments: planAssignments,
        visibleDates: days,
        resolution: isMonthRangeView ? "month" : "day",
        projectStartDate: project.startDate,
        projectEndDate: project.endDate,
      });

      if (planDisplaySegments.length === 0) continue;

      projectLanes.push({
        projectKey: project.projectKey,
        project,
        brand: project.brandId ? brandById.get(project.brandId) : undefined,
        planAssignments,
        planDisplaySegments,
      });
    }

    models.set(employee.id, {
      id: employee.id,
      resource,
      assignments: resourceAssignments,
      allocationCells: days.map((day) => {
        const date = format(day, "yyyy-MM-dd");
        return {
          id: `${employee.id}-${date}`,
          employeeId: employee.id,
          date,
          model: getAllocationCellModel({
            dayMap,
            day,
            viewMode,
          }),
        };
      }),
      projectLanes,
    });
  }

  return models;
}
