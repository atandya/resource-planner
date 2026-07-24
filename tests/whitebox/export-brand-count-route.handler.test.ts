import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/export/brand/excel/route";
import { buildBrandReportRows } from "@/lib/export/brand-report";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasFullAccess: vi.fn(),
  getCurrentEmployeeUUID: vi.fn(),
  getEngagements: vi.fn(),
  listProjects: vi.fn(),
  listEmployees: vi.fn(),
  listBrands: vi.fn(),
  exportBrandReportToExcel: vi.fn(),
  generateExcelFilename: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: mocks.getSession,
}));

vi.mock("@/lib/export/data-fetcher", () => ({
  hasFullAccess: mocks.hasFullAccess,
  getCurrentEmployeeUUID: mocks.getCurrentEmployeeUUID,
}));

vi.mock("@/lib/assignments/assignment-reads", () => ({
  getEngagements: mocks.getEngagements,
}));

vi.mock("@/lib/planner-directory/repository", () => ({
  plannerDirectoryRepository: {
    listProjects: mocks.listProjects,
    listEmployees: mocks.listEmployees,
    listBrands: mocks.listBrands,
  },
}));

vi.mock("@/lib/export/excel-export", () => ({
  exportBrandReportToExcel: mocks.exportBrandReportToExcel,
  generateExcelFilename: mocks.generateExcelFilename,
}));

// buildBrandReportRows is intentionally left un-mocked: the count and the
// eventual export must come from the exact same real aggregation.

const fakeSession = {
  access_token: "token",
  user: { id: 1, email: "full@example.com" },
  employee: { id: 1, uuid: "employee-a", full_name: "Alpha Person" },
  access: { level: "full", can_view_all: true, can_view_own_only: false },
};

const fixture = {
  projects: [{ projectKey: "campaign:1", brandId: "brand-1", sourceType: "campaign" }],
  employees: [{ employeeUuid: "employee-a", fullName: "Alpha Person" }],
  brands: [{ brandId: "brand-1", name: "Brand One" }],
  engagements: [
    { assignment_uuid: "a1", employee_uuid: "employee-a", project_key: "campaign:1" },
  ],
  allocations: [{ assignment_uuid: "a1", planned_hours: 10 }],
};

// Two employees on the same project in different departments — the smallest
// fixture where a department filter can be observed to bite.
const departmentFixture = {
  projects: fixture.projects,
  employees: [
    { employeeUuid: "employee-a", fullName: "Alpha Person", departmentId: "d1" },
    { employeeUuid: "employee-b", fullName: "Beta Person", departmentId: "d2" },
  ],
  brands: fixture.brands,
  engagements: [
    { assignment_uuid: "a1", employee_uuid: "employee-a", project_key: "campaign:1" },
    { assignment_uuid: "a2", employee_uuid: "employee-b", project_key: "campaign:1" },
  ],
  allocations: [
    { assignment_uuid: "a1", planned_hours: 10 },
    { assignment_uuid: "a2", planned_hours: 4 },
  ],
};

function mockEmptyDirectory() {
  mocks.listProjects.mockResolvedValue([]);
  mocks.listEmployees.mockResolvedValue([]);
  mocks.listBrands.mockResolvedValue([]);
}

function mockFixtureDirectory() {
  mocks.listProjects.mockResolvedValue(fixture.projects);
  mocks.listEmployees.mockResolvedValue(fixture.employees);
  mocks.listBrands.mockResolvedValue(fixture.brands);
}

// NextRequest rather than a bare Request: the handler's parameter type, so the
// call sites type-check without a cast.
function request(query: string) {
  return new NextRequest(`http://localhost:3000/api/export/brand/excel?${query}`);
}

describe("brand export route — handler behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(fakeSession);
    mocks.hasFullAccess.mockResolvedValue(true);
    mocks.getCurrentEmployeeUUID.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("countOnly=true with no engagements returns {count: 0} without rendering Excel", async () => {
    mocks.getEngagements.mockResolvedValue({ engagements: [], allocations: [] });
    mockEmptyDirectory();

    const response = await GET(
      request("startDate=2026-01-01&endDate=2026-01-31&countOnly=true")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 0 });
    expect(mocks.exportBrandReportToExcel).not.toHaveBeenCalled();
  });

  it("countOnly=true with fixture data returns the real aggregation's row count", async () => {
    mocks.getEngagements.mockResolvedValue({
      engagements: fixture.engagements,
      allocations: fixture.allocations,
    });
    mockFixtureDirectory();

    const expectedRows = buildBrandReportRows({
      engagements: fixture.engagements,
      allocations: fixture.allocations,
      projects: fixture.projects,
      employees: fixture.employees,
      brands: fixture.brands,
      brandIdFilter: null,
    });
    expect(expectedRows.length).toBeGreaterThan(0); // guard against a vacuous assertion below

    const response = await GET(
      request("startDate=2026-01-01&endDate=2026-01-31&countOnly=true")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: expectedRows.length });
    expect(mocks.exportBrandReportToExcel).not.toHaveBeenCalled();
  });

  it("departmentIds narrows the count to that department's employees", async () => {
    mocks.getEngagements.mockResolvedValue({
      engagements: departmentFixture.engagements,
      allocations: departmentFixture.allocations,
    });
    mocks.listProjects.mockResolvedValue(departmentFixture.projects);
    mocks.listEmployees.mockResolvedValue(departmentFixture.employees);
    mocks.listBrands.mockResolvedValue(departmentFixture.brands);

    const unscoped = buildBrandReportRows({
      engagements: departmentFixture.engagements,
      allocations: departmentFixture.allocations,
      projects: departmentFixture.projects,
      employees: departmentFixture.employees,
      brands: departmentFixture.brands,
      brandIdFilter: null,
    });
    const scoped = buildBrandReportRows({
      engagements: departmentFixture.engagements,
      allocations: departmentFixture.allocations,
      projects: departmentFixture.projects,
      employees: departmentFixture.employees,
      brands: departmentFixture.brands,
      brandIdFilter: null,
      departmentIdFilter: ["d1"],
    });
    expect(scoped.length).toBeLessThan(unscoped.length); // the filter must bite

    const response = await GET(
      request("startDate=2026-01-01&endDate=2026-01-31&departmentIds=d1&countOnly=true")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: scoped.length });
  });

  it("without countOnly, zero rows returns 404", async () => {
    mocks.getEngagements.mockResolvedValue({ engagements: [], allocations: [] });
    mockEmptyDirectory();

    const response = await GET(request("startDate=2026-01-01&endDate=2026-01-31"));

    expect(response.status).toBe(404);
    expect(mocks.exportBrandReportToExcel).not.toHaveBeenCalled();
  });

  it("without countOnly, rows present returns the xlsx file", async () => {
    mocks.getEngagements.mockResolvedValue({
      engagements: fixture.engagements,
      allocations: fixture.allocations,
    });
    mockFixtureDirectory();
    mocks.exportBrandReportToExcel.mockResolvedValue(Buffer.from("fake-xlsx"));
    mocks.generateExcelFilename.mockReturnValue("brand-report-2026-01-01-2026-01-31.xlsx");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const response = await GET(request("startDate=2026-01-01&endDate=2026-01-31"));

    expect(response.status).toBe(200);
    expect(logSpy).not.toHaveBeenCalled();
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(mocks.exportBrandReportToExcel).toHaveBeenCalledWith(expect.any(Array));
  });
});
