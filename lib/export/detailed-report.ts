/**
 * Detailed Data Report aggregation.
 *
 * One row per (employee, project, month) — the allocation table's own storage
 * grain joined to the directory. Plan and adjustment kinds sum invisibly and
 * zero months drop, exactly as the Brand Report does, so a pivot of this report
 * by (brand, employee) reproduces the Brand Report's numbers; reconciliation is
 * structural, not a coincidence to be re-checked each release.
 *
 * Sort keys equal column order (Department -> Employee -> Brand -> Project ->
 * Month) so the ordering is self-evident in the sheet; ids tie-break and blank
 * departments sort last, so identical data yields byte-identical files
 * (week-over-week diffing depends on that). Hours are assumed already windowed
 * to the requested month range by the caller (getEngagements).
 *
 * Department is the employee's CURRENT department — the data model keeps no
 * department history, so somebody who moved mid-range shows their present
 * department for every month. Accepted limitation.
 */

export interface DetailedReportRow {
  department: string; // "" when the employee has none
  employee: string;
  brand: string;
  projectName: string;
  projectType: string;
  month: string; // YYYY-MM-01, as stored
  plannedHours: number;
}

interface EngagementInput {
  assignment_uuid: string;
  employee_uuid: string;
  project_key: string;
}

interface AllocationInput {
  assignment_uuid: string;
  month: string;
  planned_hours: number;
}

interface ProjectInput {
  projectKey: string;
  brandId: string | null;
  name: string;
  sourceType: string | null;
}

interface EmployeeInput {
  employeeUuid: string;
  fullName: string;
  departmentId?: string | null;
}

interface BrandInput {
  brandId: string;
  name: string;
}

interface DepartmentInput {
  departmentId: string;
  name: string;
}

export interface DetailedReportInput {
  engagements: readonly EngagementInput[];
  allocations: readonly AllocationInput[];
  // readonly: the directory rows arrive from a shared cache, so this must not
  // mutate them. It only reads — the one sort below is on a locally built array.
  projects: readonly ProjectInput[];
  employees: readonly EmployeeInput[];
  brands: readonly BrandInput[];
  departments: readonly DepartmentInput[];
  // Empty array or null/absent = no filter. When the department filter is
  // active, employees with no department are excluded.
  brandIdFilter?: string[] | null;
  departmentIdFilter?: string[] | null;
}

/** A row plus the ids that break ties, stripped before returning. */
interface SortableRow extends DetailedReportRow {
  departmentId: string;
  employeeUuid: string;
  brandId: string;
  projectKey: string;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function buildDetailedReportRows(input: DetailedReportInput): DetailedReportRow[] {
  const { engagements, allocations, projects, employees, brands, departments } = input;
  const brandIdFilter =
    input.brandIdFilter && input.brandIdFilter.length ? new Set(input.brandIdFilter) : null;
  const departmentIdFilter =
    input.departmentIdFilter && input.departmentIdFilter.length
      ? new Set(input.departmentIdFilter)
      : null;

  const projectByKey = new Map(projects.map((p) => [p.projectKey, p]));
  const employeeByUuid = new Map(employees.map((e) => [e.employeeUuid, e]));
  // planner_projects has no brand_name column; resolve names via brands.
  const brandNameById = new Map(brands.map((b) => [b.brandId, b.name]));
  const departmentNameById = new Map(departments.map((d) => [d.departmentId, d.name]));

  // Sum plan + adjustment per (assignment, month), grouped by assignment so the
  // engagement loop below reads only its own months: one pass over allocations,
  // one pass over engagements, no rescanning (O(E + A), not O(E x A)).
  const monthlyHoursByAssignment = new Map<string, Map<string, number>>();
  for (const alloc of allocations) {
    let byMonth = monthlyHoursByAssignment.get(alloc.assignment_uuid);
    if (!byMonth) {
      byMonth = new Map<string, number>();
      monthlyHoursByAssignment.set(alloc.assignment_uuid, byMonth);
    }
    byMonth.set(alloc.month, (byMonth.get(alloc.month) || 0) + (Number(alloc.planned_hours) || 0));
  }

  const rows: SortableRow[] = [];
  for (const engagement of engagements) {
    const project = projectByKey.get(engagement.project_key);
    if (brandIdFilter && (!project?.brandId || !brandIdFilter.has(project.brandId))) {
      continue;
    }
    const employee = employeeByUuid.get(engagement.employee_uuid);
    const departmentId = employee?.departmentId || null;
    if (departmentIdFilter && (!departmentId || !departmentIdFilter.has(departmentId))) {
      continue;
    }

    const monthlyHours = monthlyHoursByAssignment.get(engagement.assignment_uuid);
    if (!monthlyHours) continue;

    // project_key is "<sourceType>:<id>", so the prefix is the fallback.
    const projectType = project?.sourceType || engagement.project_key.split(':')[0] || 'unknown';
    const department = (departmentId && departmentNameById.get(departmentId)) || '';
    const employeeName = employee?.fullName || 'Unknown Employee';
    const brand =
      (project?.brandId && brandNameById.get(project.brandId)) || 'Unknown Brand';
    const projectName = project?.name || engagement.project_key;

    for (const [month, hours] of monthlyHours) {
      const plannedHours = round1(hours);
      if (plannedHours === 0) continue; // no zero rows — a semi-raw dataset, not a calendar
      rows.push({
        department,
        employee: employeeName,
        brand,
        projectName,
        projectType,
        month,
        plannedHours,
        departmentId: departmentId ?? '',
        employeeUuid: engagement.employee_uuid,
        brandId: project?.brandId ?? '',
        projectKey: engagement.project_key,
      });
    }
  }

  rows.sort(
    (a, b) =>
      // Blank department last regardless of collation, rather than leaning on a
      // sentinel character sorting high in some ICU build.
      Number(a.department === '') - Number(b.department === '') ||
      a.department.localeCompare(b.department) ||
      a.departmentId.localeCompare(b.departmentId) ||
      a.employee.localeCompare(b.employee) ||
      a.employeeUuid.localeCompare(b.employeeUuid) ||
      a.brand.localeCompare(b.brand) ||
      a.brandId.localeCompare(b.brandId) ||
      a.projectName.localeCompare(b.projectName) ||
      a.projectKey.localeCompare(b.projectKey) ||
      a.month.localeCompare(b.month),
  );

  // Rebuilt field by field rather than spread-minus-keys: the tie-break ids are
  // internal, and this pins the property order to the sheet's column order.
  return rows.map((row) => ({
    department: row.department,
    employee: row.employee,
    brand: row.brand,
    projectName: row.projectName,
    projectType: row.projectType,
    month: row.month,
    plannedHours: row.plannedHours,
  }));
}
