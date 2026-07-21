/**
 * Brand Report aggregation.
 *
 * Rolls monthly planned allocations up to one row per (brand, employee),
 * with hours split into per-project-type buckets (campaign / pitch / other).
 * Projects are disregarded: an employee's hours across all of a brand's
 * projects of a given type are summed. Hours are assumed already windowed to
 * the requested month range by the caller (getEngagements).
 */

export interface BrandReportRow {
  brand: string;
  employee: string;
  campaignHours: number;
  pitchHours: number;
  otherHours: number;
  totalHours: number;
}

interface EngagementInput {
  assignment_uuid: string;
  employee_uuid: string;
  project_key: string;
}

interface AllocationInput {
  assignment_uuid: string;
  planned_hours: number;
}

interface ProjectInput {
  projectKey: string;
  brandId: string | null;
  brandName?: string | null;
  sourceType: string | null;
}

interface EmployeeInput {
  employeeUuid: string;
  fullName: string;
}

interface BrandInput {
  brandId: string;
  name: string;
}

export interface BrandReportInput {
  engagements: readonly EngagementInput[];
  allocations: readonly AllocationInput[];
  // readonly: the directory rows arrive from a shared cache, so this must not
  // mutate them. It only reads — the one sort below is on a locally built array.
  projects: readonly ProjectInput[];
  employees: readonly EmployeeInput[];
  brands: readonly BrandInput[];
  brandIdFilter?: string[] | null;
}

interface Bucket {
  brand: string;
  employee: string;
  campaignHours: number;
  pitchHours: number;
  otherHours: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function buildBrandReportRows(input: BrandReportInput): BrandReportRow[] {
  const { engagements, allocations, projects, employees, brands } = input;
  const brandIdFilter =
    input.brandIdFilter && input.brandIdFilter.length ? new Set(input.brandIdFilter) : null;

  const projectByKey = new Map(projects.map((p) => [p.projectKey, p]));
  const employeeByUuid = new Map(employees.map((e) => [e.employeeUuid, e]));
  // planner_projects has no brand_name column; resolve names via brands.
  const brandNameById = new Map(brands.map((b) => [b.brandId, b.name]));

  const hoursByAssignment = new Map<string, number>();
  for (const alloc of allocations) {
    hoursByAssignment.set(
      alloc.assignment_uuid,
      (hoursByAssignment.get(alloc.assignment_uuid) || 0) + (Number(alloc.planned_hours) || 0),
    );
  }

  // Aggregate per (brandId, employee). Brands keyed by id so two distinct
  // brands sharing a name don't merge.
  const buckets = new Map<string, Bucket>();
  for (const engagement of engagements) {
    const project = projectByKey.get(engagement.project_key);
    if (brandIdFilter && (!project?.brandId || !brandIdFilter.has(project.brandId))) {
      continue;
    }
    // project_key is "<sourceType>:<id>", so the prefix is the fallback.
    const type = project?.sourceType || engagement.project_key.split(':')[0] || 'unknown';
    const brandId = project?.brandId || 'unknown';
    const key = `${brandId}|${engagement.employee_uuid}`;
    const hours = hoursByAssignment.get(engagement.assignment_uuid) || 0;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        brand:
          (project?.brandId && brandNameById.get(project.brandId)) ||
          project?.brandName ||
          'Unknown Brand',
        employee: employeeByUuid.get(engagement.employee_uuid)?.fullName || 'Unknown Employee',
        campaignHours: 0,
        pitchHours: 0,
        otherHours: 0,
      };
      buckets.set(key, bucket);
    }

    if (type === 'campaign') bucket.campaignHours += hours;
    else if (type === 'pitch') bucket.pitchHours += hours;
    else bucket.otherHours += hours;
  }

  const rows: BrandReportRow[] = [];
  for (const bucket of buckets.values()) {
    const campaignHours = round1(bucket.campaignHours);
    const pitchHours = round1(bucket.pitchHours);
    const otherHours = round1(bucket.otherHours);
    const totalHours = round1(campaignHours + pitchHours + otherHours);
    if (totalHours === 0) continue; // drop employees with no hours in range
    rows.push({ brand: bucket.brand, employee: bucket.employee, campaignHours, pitchHours, otherHours, totalHours });
  }

  rows.sort((a, b) => a.brand.localeCompare(b.brand) || a.employee.localeCompare(b.employee));
  return rows;
}
