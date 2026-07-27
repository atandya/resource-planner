import type { SessionData } from "@/lib/auth/session";
import { requestPlannerDirectoryRepair } from "@/lib/planner-directory/repair";
import { plannerDirectoryRepository } from "@/lib/planner-directory/repository";
import type {
  PlannerDirectoryBrandRow,
  PlannerDirectoryDepartmentRow,
  PlannerDirectoryEmployeeRow,
  PlannerDirectoryProjectRow,
} from "@/lib/planner-directory/types";
import { fetchPlannerTimeline } from "@/lib/query/server/planner-prefetch";
import { randomColor } from "@/lib/utils/color";
import type { Employee } from "@/lib/query/hooks/useEmployees";
import type {
  PlannerTimelineRequest,
  PlannerTimelineResponse,
} from "@/lib/planner/planner-loading";

// departmentId must ride along: the client department filter compares
// employee.departmentId (lib/timeline-v2/employees.ts), and bootstrap rows are
// the timeline's ONLY employee rows since the complete-list path was retired.
export type MinimalTimelineEmployee = Pick<
  Employee,
  | "id"
  | "fullName"
  | "position"
  | "weeklyCapacity"
  | "department"
  | "departmentId"
  | "sourceEmployeeId"
  | "employmentStatus"
>;

// Wire-shapes for the reference maps: exactly the fields the client mappers
// read (toProjectOption / toBrandOption / department badge). The raw directory
// rows carry sync plumbing (source_hash, last_seen_at, ...) that only bloats
// the payload (payload-diet spec 2026-06-12).
export type BootstrapProject = Pick<
  PlannerDirectoryProjectRow,
  "sourceProjectId" | "name" | "color" | "status" | "sourceType" | "brandId" | "startDate" | "endDate" | "submitDate"
>;
export type BootstrapBrand = Pick<
  PlannerDirectoryBrandRow,
  "brandId" | "name" | "companyName" | "color" | "status" | "sourceUpdatedAt" | "syncedAt"
>;
export type BootstrapDepartment = Pick<PlannerDirectoryDepartmentRow, "departmentId" | "name" | "color">;

export function toBootstrapProject(row: PlannerDirectoryProjectRow): BootstrapProject {
  return {
    sourceProjectId: row.sourceProjectId,
    name: row.name,
    color: row.color,
    status: row.status,
    sourceType: row.sourceType,
    brandId: row.brandId,
    startDate: row.startDate,
    endDate: row.endDate,
    submitDate: row.submitDate,
  };
}

export function toBootstrapBrand(row: PlannerDirectoryBrandRow): BootstrapBrand {
  return {
    brandId: row.brandId,
    name: row.name,
    companyName: row.companyName,
    color: row.color,
    status: row.status,
    sourceUpdatedAt: row.sourceUpdatedAt,
    syncedAt: row.syncedAt,
  };
}

export function toBootstrapDepartment(row: PlannerDirectoryDepartmentRow): BootstrapDepartment {
  return {
    departmentId: row.departmentId,
    name: row.name,
    color: row.color,
  };
}

export type PlannerHomeBootstrapRequest = PlannerTimelineRequest;

export type PlannerHomeBootstrapResponse = {
  request: PlannerHomeBootstrapRequest;
  employees: MinimalTimelineEmployee[];
  employeeTotal: number;
  departmentsById: Record<string, BootstrapDepartment>;
  brandsById: Record<string, BootstrapBrand>;
  projectsById: Record<string, BootstrapProject>;
  plannerTimeline: PlannerTimelineResponse;
  metadataPartial: boolean;
  freshness: {
    directoryFetchedAt: string;
    plannerFetchedAt: string;
  };
};

export function toMinimalEmployee(
  employee: PlannerDirectoryEmployeeRow,
  departmentsById: Record<string, BootstrapDepartment>
): MinimalTimelineEmployee {
  const department = employee.departmentId ? departmentsById[employee.departmentId] : undefined;

  return {
    id: employee.employeeUuid,
    sourceEmployeeId: employee.sourceEmployeeId,
    employmentStatus: employee.employmentStatus as Employee["employmentStatus"],
    fullName: employee.fullName,
    position: employee.position ?? "",
    weeklyCapacity: employee.weeklyCapacity,
    departmentId: employee.departmentId,
    department: department
      ? {
          id: department.departmentId,
          name: department.name,
          color: department.color ?? randomColor(department.departmentId),
        }
      : undefined,
  };
}

function getReferencedProjectIds(plannerTimeline: PlannerTimelineResponse): Set<string> {
  const projectIds = new Set<string>();

  for (const assignment of plannerTimeline.assignments) {
    // assignment.projectKey is "{type}:{sourceProjectId}"; bootstrap projects
    // are keyed by sourceProjectId, so strip the type prefix.
    if (assignment.projectKey) {
      const sourceProjectId = assignment.projectKey.slice(assignment.projectKey.indexOf(":") + 1);
      if (sourceProjectId) projectIds.add(sourceProjectId);
    }
  }

  return projectIds;
}

function indexById<T extends { [key: string]: unknown }>(
  rows: T[],
  getId: (row: T) => string
): Record<string, T> {
  return rows.reduce<Record<string, T>>((acc, row) => {
    acc[getId(row)] = row;
    return acc;
  }, {});
}

function getDepartmentIdsFromEmployees(employees: PlannerDirectoryEmployeeRow[]): string[] {
  return Array.from(
    new Set(
      employees
        .map((employee) => employee.departmentId)
        .filter((departmentId): departmentId is string => !!departmentId)
    )
  );
}

function getBrandIdsFromProjects(projects: PlannerDirectoryProjectRow[]): string[] {
  return Array.from(
    new Set(projects.map((project) => project.brandId).filter((brandId): brandId is string => !!brandId))
  );
}

function getMissingIds<T extends { [key: string]: unknown }>(
  referencedIds: Set<string>,
  rowsById: Record<string, T>
): string[] {
  return Array.from(referencedIds).filter((id) => !rowsById[id]);
}

export async function fetchPlannerHomeBootstrap(
  session: SessionData,
  request: PlannerHomeBootstrapRequest
): Promise<PlannerHomeBootstrapResponse> {
  const directoryFetchedAt = new Date().toISOString();

  // Load ALL employees for the visible window once; the client filters by
  // brand/project/department/search. Restricted users still see only their own
  // row, and the active-in-range rule still gates inactive employees.
  const employeeRows = await plannerDirectoryRepository.listTimelineEmployees({
    employeeUuid: session.access.can_view_all ? null : session.employee.uuid,
    assignmentRange: { startDate: request.startDate, endDate: request.endDate },
  });
  const pageEmployeeUuids = employeeRows.map((employee) => employee.employeeUuid);

  const [departments, plannerTimeline] = await Promise.all([
    plannerDirectoryRepository.listDepartments(),
    pageEmployeeUuids.length > 0
      ? fetchPlannerTimeline(session, request, { employeeUuids: pageEmployeeUuids })
      : // An empty employee page must mean an empty timeline — without the
        // guard, an empty IN-list would fall through to a company-wide query.
        Promise.resolve({ request, assignments: [] } satisfies PlannerTimelineResponse),
  ]);

  const departmentsById = indexById(departments.map(toBootstrapDepartment), (department) => department.departmentId);

  const referencedProjectIds = getReferencedProjectIds(plannerTimeline);
  const projects = await plannerDirectoryRepository.listProjectsForBootstrap({
    referencedProjectIds: Array.from(referencedProjectIds),
  });
  const projectsById = indexById(projects.map(toBootstrapProject), (project) => project.sourceProjectId);
  const missingReferencedProjectIds = getMissingIds(referencedProjectIds, projectsById);

  const brandIds = getBrandIdsFromProjects(projects);
  const brands = await plannerDirectoryRepository.listBrandsByIds(brandIds);
  const brandsById = indexById(brands.map(toBootstrapBrand), (brand) => brand.brandId);
  const missingReferencedBrandIds = getMissingIds(new Set(brandIds), brandsById);

  const missingDepartmentIds = getMissingIds(
    new Set(getDepartmentIdsFromEmployees(employeeRows)),
    departmentsById
  );

  if (missingReferencedProjectIds.length > 0) {
    void Promise.all(
      missingReferencedProjectIds.slice(0, 3).map((projectId) =>
        requestPlannerDirectoryRepair({
          session,
          entityType: "project",
          sourceId: projectId,
          triggerSource: "bootstrap",
          triggeredBy: session.employee.uuid,
        }).catch((error) => {
          console.error("[Planner bootstrap] Failed to request project repair:", error);
        })
      )
    );
  }

  if (missingReferencedBrandIds.length > 0) {
    void Promise.all(
      missingReferencedBrandIds.slice(0, 3).map((brandId) =>
        requestPlannerDirectoryRepair({
          session,
          entityType: "brand",
          sourceId: brandId,
          triggerSource: "bootstrap",
          triggeredBy: session.employee.uuid,
        }).catch((error) => {
          console.error("[Planner bootstrap] Failed to request brand repair:", error);
        })
      )
    );
  }

  if (missingDepartmentIds.length > 0) {
    void Promise.all(
      missingDepartmentIds.slice(0, 3).map((departmentId) =>
        requestPlannerDirectoryRepair({
          session,
          entityType: "department",
          sourceId: departmentId,
          triggerSource: "bootstrap",
          triggeredBy: session.employee.uuid,
        }).catch((error) => {
          console.error("[Planner bootstrap] Failed to request department repair:", error);
        })
      )
    );
  }

  const metadataPartial =
    missingReferencedProjectIds.length > 0 ||
    missingReferencedBrandIds.length > 0 ||
    missingDepartmentIds.length > 0;

  return {
    request,
    employees: employeeRows.map((employee) => toMinimalEmployee(employee, departmentsById)),
    employeeTotal: employeeRows.length,
    departmentsById,
    brandsById,
    projectsById,
    plannerTimeline,
    metadataPartial,
    freshness: {
      directoryFetchedAt,
      plannerFetchedAt: directoryFetchedAt,
    },
  };
}
