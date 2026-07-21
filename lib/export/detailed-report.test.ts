import { describe, it, expect } from 'vitest';
import { buildDetailedReportRows, type DetailedReportInput } from '@/lib/export/detailed-report';
import { buildBrandReportRows } from '@/lib/export/brand-report';

/**
 * The stakeholder's own example, verbatim: one person, two brands, three
 * allocation months. It is the shape of the whole report in miniature.
 */
const ABDUL: DetailedReportInput = {
  engagements: [
    { assignment_uuid: 'a1', employee_uuid: 'e1', project_key: 'campaign:p1' },
    { assignment_uuid: 'a2', employee_uuid: 'e1', project_key: 'campaign:p2' },
  ],
  allocations: [
    { assignment_uuid: 'a1', month: '2025-09-01', planned_hours: 10 },
    { assignment_uuid: 'a1', month: '2025-10-01', planned_hours: 30 },
    { assignment_uuid: 'a2', month: '2025-09-01', planned_hours: 20 },
  ],
  projects: [
    { projectKey: 'campaign:p1', brandId: 'b1', name: 'Abadinusa Campaign', sourceType: 'campaign' },
    { projectKey: 'campaign:p2', brandId: 'b2', name: 'AI Rudder Campaign', sourceType: 'campaign' },
  ],
  employees: [{ employeeUuid: 'e1', fullName: 'Abdul Gofur', departmentId: 'd1' }],
  brands: [
    { brandId: 'b1', name: 'Abadinusa' },
    { brandId: 'b2', name: 'AI Rudder' },
  ],
  departments: [{ departmentId: 'd1', name: 'MTI' }],
};

describe('buildDetailedReportRows', () => {
  it('emits one row per (employee, project, month) — the stakeholder example', () => {
    expect(buildDetailedReportRows(ABDUL)).toEqual([
      {
        department: 'MTI',
        employee: 'Abdul Gofur',
        brand: 'Abadinusa',
        projectName: 'Abadinusa Campaign',
        projectType: 'campaign',
        month: '2025-09-01',
        plannedHours: 10,
      },
      {
        department: 'MTI',
        employee: 'Abdul Gofur',
        brand: 'Abadinusa',
        projectName: 'Abadinusa Campaign',
        projectType: 'campaign',
        month: '2025-10-01',
        plannedHours: 30,
      },
      {
        department: 'MTI',
        employee: 'Abdul Gofur',
        brand: 'AI Rudder',
        projectName: 'AI Rudder Campaign',
        projectType: 'campaign',
        month: '2025-09-01',
        plannedHours: 20,
      },
    ]);
  });

  it('sums plan and adjustment kinds invisibly into one row per month', () => {
    const rows = buildDetailedReportRows({
      ...ABDUL,
      engagements: [{ assignment_uuid: 'a1', employee_uuid: 'e1', project_key: 'campaign:p1' }],
      // Same (assignment, month), two kinds — the plan row and its adjustment.
      allocations: [
        { assignment_uuid: 'a1', month: '2025-09-01', planned_hours: 8 },
        { assignment_uuid: 'a1', month: '2025-09-01', planned_hours: 2 },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].plannedHours).toBe(10);
  });

  it('omits months with zero hours, and months with no allocation at all', () => {
    const rows = buildDetailedReportRows({
      ...ABDUL,
      engagements: [{ assignment_uuid: 'a1', employee_uuid: 'e1', project_key: 'campaign:p1' }],
      allocations: [
        { assignment_uuid: 'a1', month: '2025-09-01', planned_hours: 0 },
        // An adjustment that cancels its plan row leaves a zero month, not a row.
        { assignment_uuid: 'a1', month: '2025-10-01', planned_hours: 5 },
        { assignment_uuid: 'a1', month: '2025-10-01', planned_hours: -5 },
        { assignment_uuid: 'a1', month: '2025-11-01', planned_hours: 7 },
      ],
    });
    expect(rows.map((r) => r.month)).toEqual(['2025-11-01']);
  });

  it('rounds each row to 1 decimal', () => {
    const rows = buildDetailedReportRows({
      ...ABDUL,
      engagements: [{ assignment_uuid: 'a1', employee_uuid: 'e1', project_key: 'campaign:p1' }],
      allocations: [
        { assignment_uuid: 'a1', month: '2025-09-01', planned_hours: 10.04 },
        { assignment_uuid: 'a1', month: '2025-09-01', planned_hours: 0.02 },
      ],
    });
    expect(rows[0].plannedHours).toBe(10.1);
  });

  it('honors the brand id filter', () => {
    const rows = buildDetailedReportRows({ ...ABDUL, brandIdFilter: ['b2'] });
    expect(rows).toHaveLength(1);
    expect(rows[0].brand).toBe('AI Rudder');
  });

  it('treats an empty brand id filter as no filter', () => {
    expect(buildDetailedReportRows({ ...ABDUL, brandIdFilter: [] })).toHaveLength(3);
  });

  // Departments hang off the EMPLOYEE — the only department hook the data has.
  const DEPARTMENTS: DetailedReportInput = {
    engagements: [
      { assignment_uuid: 'a1', employee_uuid: 'e1', project_key: 'campaign:p1' },
      { assignment_uuid: 'a2', employee_uuid: 'e2', project_key: 'campaign:p1' },
      { assignment_uuid: 'a3', employee_uuid: 'e3', project_key: 'campaign:p1' },
    ],
    allocations: [
      { assignment_uuid: 'a1', month: '2025-09-01', planned_hours: 10 },
      { assignment_uuid: 'a2', month: '2025-09-01', planned_hours: 20 },
      { assignment_uuid: 'a3', month: '2025-09-01', planned_hours: 30 },
    ],
    projects: [
      { projectKey: 'campaign:p1', brandId: 'b1', name: 'Abadinusa Campaign', sourceType: 'campaign' },
    ],
    employees: [
      { employeeUuid: 'e1', fullName: 'Andi', departmentId: 'd1' },
      { employeeUuid: 'e2', fullName: 'Budi', departmentId: 'd2' },
      { employeeUuid: 'e3', fullName: 'Citra', departmentId: null },
    ],
    brands: [{ brandId: 'b1', name: 'Abadinusa' }],
    departments: [
      { departmentId: 'd1', name: 'MTI' },
      { departmentId: 'd2', name: 'Creative' },
    ],
  };

  it('honors the department id filter and excludes departmentless employees while it is active', () => {
    const rows = buildDetailedReportRows({ ...DEPARTMENTS, departmentIdFilter: ['d1'] });
    expect(rows.map((r) => r.employee)).toEqual(['Andi']);
  });

  it('includes departmentless employees when no department filter is set', () => {
    expect(buildDetailedReportRows(DEPARTMENTS).map((r) => r.employee)).toEqual([
      'Budi',
      'Andi',
      'Citra',
    ]);
    expect(
      buildDetailedReportRows({ ...DEPARTMENTS, departmentIdFilter: [] }).map((r) => r.employee),
    ).toEqual(['Budi', 'Andi', 'Citra']);
  });

  it('sorts by department name with blank departments last, then employee', () => {
    const rows = buildDetailedReportRows(DEPARTMENTS);
    expect(rows.map((r) => [r.department, r.employee])).toEqual([
      ['Creative', 'Budi'],
      ['MTI', 'Andi'],
      ['', 'Citra'], // no department — always last, never first
    ]);
  });

  it('breaks a shared employee name tie on the employee uuid, deterministically', () => {
    const input: DetailedReportInput = {
      ...DEPARTMENTS,
      engagements: [
        { assignment_uuid: 'a2', employee_uuid: 'e2', project_key: 'campaign:p1' },
        { assignment_uuid: 'a1', employee_uuid: 'e1', project_key: 'campaign:p1' },
      ],
      allocations: [
        { assignment_uuid: 'a1', month: '2025-09-01', planned_hours: 10 },
        { assignment_uuid: 'a2', month: '2025-09-01', planned_hours: 20 },
      ],
      // Two different people, same name, same department.
      employees: [
        { employeeUuid: 'e1', fullName: 'Andi', departmentId: 'd1' },
        { employeeUuid: 'e2', fullName: 'Andi', departmentId: 'd1' },
      ],
    };
    expect(buildDetailedReportRows(input).map((r) => r.plannedHours)).toEqual([10, 20]);
  });

  it('sorts months ascending across a year boundary', () => {
    const rows = buildDetailedReportRows({
      ...ABDUL,
      engagements: [{ assignment_uuid: 'a1', employee_uuid: 'e1', project_key: 'campaign:p1' }],
      allocations: [
        { assignment_uuid: 'a1', month: '2026-01-01', planned_hours: 3 },
        { assignment_uuid: 'a1', month: '2025-10-01', planned_hours: 1 },
        { assignment_uuid: 'a1', month: '2025-12-01', planned_hours: 2 },
      ],
    });
    expect(rows.map((r) => r.month)).toEqual(['2025-10-01', '2025-12-01', '2026-01-01']);
  });

  it('falls back like the brand report when the project or brand is unknown', () => {
    const rows = buildDetailedReportRows({
      ...ABDUL,
      engagements: [
        { assignment_uuid: 'a1', employee_uuid: 'e9', project_key: 'excel:p9' },
        { assignment_uuid: 'a2', employee_uuid: 'e1', project_key: 'campaign:p3' },
      ],
      allocations: [
        { assignment_uuid: 'a1', month: '2025-09-01', planned_hours: 4 },
        { assignment_uuid: 'a2', month: '2025-09-01', planned_hours: 5 },
      ],
      // p9 is missing from the directory entirely; p3 is present but brandless.
      projects: [{ projectKey: 'campaign:p3', brandId: null, name: 'Orphan Campaign', sourceType: 'campaign' }],
    });
    expect(rows).toEqual([
      {
        department: 'MTI',
        employee: 'Abdul Gofur',
        brand: 'Unknown Brand',
        projectName: 'Orphan Campaign',
        projectType: 'campaign',
        month: '2025-09-01',
        plannedHours: 5,
      },
      {
        department: '',
        employee: 'Unknown Employee',
        brand: 'Unknown Brand',
        projectName: 'excel:p9', // no directory row — the key is the best name we have
        projectType: 'excel', // project_key is "<sourceType>:<id>"
        month: '2025-09-01',
        plannedHours: 4,
      },
    ]);
  });

  // The reconciliation guarantee is the whole reason this report can replace a
  // Brand Report export: pivoting these rows by (brand, employee) must land on
  // the Brand Report's own numbers, from the same fixture.
  it('reconciles with the Brand Report when pivoted by brand and employee', () => {
    const detailed = buildDetailedReportRows(ABDUL);
    const pivot = new Map<string, number>();
    for (const row of detailed) {
      const key = `${row.brand}|${row.employee}`;
      pivot.set(key, (pivot.get(key) || 0) + row.plannedHours);
    }
    const brandRows = buildBrandReportRows({
      engagements: ABDUL.engagements,
      allocations: ABDUL.allocations,
      projects: ABDUL.projects,
      employees: ABDUL.employees,
      brands: ABDUL.brands,
    });
    expect(brandRows.map((r) => [`${r.brand}|${r.employee}`, r.totalHours])).toEqual(
      brandRows.map((r) => [`${r.brand}|${r.employee}`, pivot.get(`${r.brand}|${r.employee}`)]),
    );
    expect([...pivot.entries()].sort()).toEqual([
      ['AI Rudder|Abdul Gofur', 20],
      ['Abadinusa|Abdul Gofur', 40],
    ]);
  });
});
