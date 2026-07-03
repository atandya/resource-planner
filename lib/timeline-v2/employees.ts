import type { Assignment } from "@/lib/query/hooks/useAssignments";
import type { Employee } from "@/lib/query/hooks/useEmployees";
import type { ProjectOption } from "@/lib/query/hooks/useProjects";
import {
  getMatchingTimelineEmployeeIds,
  hasActiveTimelineScopeFilter,
} from "@/lib/timeline-v2/timeline-filters";
import type { TimelineProjectTypeScope } from "@/lib/timeline-v2/types";

type EmployeeNameRecord = {
  fullName?: string | null;
  full_name?: string | null;
};

type TimelineEmployeeFilters = {
  brandIds: string[];
  departments: string[];
  projectIds: string[];
  projectTypeScope?: TimelineProjectTypeScope;
  searchQuery?: string;
};

export type TimelineEmployeeFilterInput = {
  employees: Employee[];
  dateFilteredAssignments: Assignment[];
  projectByKey: Map<string, ProjectOption>;
  selectedBrandProjectKeys?: Set<string>;
  filters: TimelineEmployeeFilters;
};

function normalizeEmployeeName(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function getEmployeeIdsWithWork(
  dateFilteredAssignments: Assignment[]
): Set<string> {
  const ids = new Set<string>();
  for (const assignment of dateFilteredAssignments) ids.add(assignment.employeeId);
  return ids;
}

// Same name AND same source id collapse together. A null source id falls back to
// the unique employee id, so source-less rows never merge with anything.
function getEmployeeDedupeKey(employee: Employee): string {
  const sourceKey = employee.sourceEmployeeId ?? employee.id;
  return `${normalizeEmployeeName(employee.fullName)}|${sourceKey}`;
}

// Tie-break: a record with visible work beats one without; among equals an active
// record wins; otherwise the incumbent (already alphabetical) stays.
function isBetterEmployeeRepresentative(
  candidate: Employee,
  current: Employee,
  idsWithWork: Set<string>
): boolean {
  const candidateHasWork = idsWithWork.has(candidate.id);
  const currentHasWork = idsWithWork.has(current.id);
  if (candidateHasWork !== currentHasWork) return candidateHasWork;

  const candidateActive = candidate.employmentStatus === "active";
  const currentActive = current.employmentStatus === "active";
  if (candidateActive !== currentActive) return candidateActive;

  return false;
}

// The planner directory holds the same person under many employee uuids (a sync
// inserts instead of upserts), so a single name renders dozens of times. Collapse
// to one representative per name+source so each resource appears exactly once.
// Input must already be alphabetically sorted — first-appearance order is kept.
export function dedupeTimelineEmployeesByNameAndSource(
  employees: Employee[],
  idsWithWork: Set<string>
): Employee[] {
  const representativeByKey = new Map<string, Employee>();
  const keyOrder: string[] = [];

  for (const employee of employees) {
    const key = getEmployeeDedupeKey(employee);
    const current = representativeByKey.get(key);
    if (!current) {
      representativeByKey.set(key, employee);
      keyOrder.push(key);
      continue;
    }
    if (isBetterEmployeeRepresentative(employee, current, idsWithWork)) {
      representativeByKey.set(key, employee);
    }
  }

  return keyOrder.map((key) => representativeByKey.get(key)!);
}

export function sortTimelineEmployees(employees: Employee[]): Employee[] {
  return sortEmployeeRecordsByName(employees);
}

export function sortEmployeeRecordsByName<T extends EmployeeNameRecord>(employees: T[]): T[] {
  return [...employees].sort((a, b) => {
    const aName = a.fullName ?? a.full_name ?? "";
    const bName = b.fullName ?? b.full_name ?? "";
    return aName.localeCompare(bName, undefined, { sensitivity: "base" });
  });
}

function matchesSearch(employee: Employee, query: string): boolean {
  if (employee.fullName.toLowerCase().includes(query)) return true;
  if (employee.position?.toLowerCase().includes(query)) return true;
  if (employee.department?.name?.toLowerCase().includes(query)) return true;

  for (const assignment of employee.assignments ?? []) {
    if (assignment.project?.name?.toLowerCase().includes(query)) return true;
  }

  for (const brandAssignment of employee.employeeBrandAssignments ?? []) {
    if (brandAssignment.brand?.name?.toLowerCase().includes(query)) return true;
  }

  return false;
}

export function filterTimelineEmployees({
  employees,
  dateFilteredAssignments,
  projectByKey,
  selectedBrandProjectKeys,
  filters,
}: TimelineEmployeeFilterInput): Employee[] {
  let filtered = employees;

  if (
    hasActiveTimelineScopeFilter({
      brandIds: filters.brandIds,
      projectIds: filters.projectIds,
      projectTypeScope: filters.projectTypeScope,
    })
  ) {
    const matchingEmployeeIds = getMatchingTimelineEmployeeIds({
      dateFilteredAssignments,
      projectByKey,
      selectedBrandProjectKeys,
      filters: {
        brandIds: filters.brandIds,
        projectIds: filters.projectIds,
        projectTypeScope: filters.projectTypeScope,
      },
    });

    filtered = filtered.filter((employee) => matchingEmployeeIds?.has(employee.id));
  }

  if (filters.departments.length > 0) {
    filtered = filtered.filter(
      (employee) => employee.departmentId !== null && filters.departments.includes(employee.departmentId)
    );
  }

  const query = filters.searchQuery?.toLowerCase().trim();
  if (query) {
    filtered = filtered.filter((employee) => matchesSearch(employee, query));
  }

  const sorted = sortTimelineEmployees(filtered);
  const idsWithWork = getEmployeeIdsWithWork(dateFilteredAssignments);
  return dedupeTimelineEmployeesByNameAndSource(sorted, idsWithWork);
}
