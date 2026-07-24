import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/export/detailed/excel/route";
import { buildDetailedReportRows } from "@/lib/export/detailed-report";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasFullAccess: vi.fn(),
  getCurrentEmployeeUUID: vi.fn(),
  getEngagements: vi.fn(),
  listProjects: vi.fn(),
  listEmployees: vi.fn(),
  listBrands: vi.fn(),
  listDepartments: vi.fn(),
  exportDetailedReportToExcel: vi.fn(),
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
    listDepartments: mocks.listDepartments,
  },
}));

vi.mock("@/lib/export/excel-export", () => ({
  exportDetailedReportToExcel: mocks.exportDetailedReportToExcel,
  generateExcelFilename: mocks.generateExcelFilename,
}));

// buildDetailedReportRows is intentionally left un-mocked: the count and the
// eventual export must come from the exact same real aggregation.

const fakeSession = {
  access_token: "token",
  user: { id: 1, email: "full@example.com" },
  employee: { id: 1, uuid: "employee-a", full_name: "Alpha Person" },
  access: { level: "full", can_view_all: true, can_view_own_only: false },
};

const fixture = {
  projects: [
    { projectKey: "campaign:1", brandId: "brand-1", name: "Campaign One", sourceType: "campaign" },
  ],
  employees: [
    { employeeUuid: "employee-a", fullName: "Alpha Person", departmentId: "d1" },
    { employeeUuid: "employee-b", fullName: "Beta Person", departmentId: "d2" },
  ],
  brands: [{ brandId: "brand-1", name: "Brand One" }],
  departments: [
    { departmentId: "d1", name: "Creative" },
    { departmentId: "d2", name: "Media" },
  ],
  engagements: [
    { assignment_uuid: "a1", employee_uuid: "employee-a", project_key: "campaign:1" },
    { assignment_uuid: "a2", employee_uuid: "employee-b", project_key: "campaign:1" },
  ],
  allocations: [
    { assignment_uuid: "a1", month: "2025-10-01", planned_hours: 10 },
    { assignment_uuid: "a1", month: "2026-01-01", planned_hours: 6 },
    { assignment_uuid: "a2", month: "2025-10-01", planned_hours: 4 },
  ],
};

function mockEmptyDirectory() {
  mocks.listProjects.mockResolvedValue([]);
  mocks.listEmployees.mockResolvedValue([]);
  mocks.listBrands.mockResolvedValue([]);
  mocks.listDepartments.mockResolvedValue([]);
}

function mockFixtureDirectory() {
  mocks.listProjects.mockResolvedValue(fixture.projects);
  mocks.listEmployees.mockResolvedValue(fixture.employees);
  mocks.listBrands.mockResolvedValue(fixture.brands);
  mocks.listDepartments.mockResolvedValue(fixture.departments);
}

function mockFixtureEngagements() {
  mocks.getEngagements.mockResolvedValue({
    engagements: fixture.engagements,
    allocations: fixture.allocations,
  });
}

function realRows(departmentIdFilter: string[] | null) {
  return buildDetailedReportRows({
    engagements: fixture.engagements,
    allocations: fixture.allocations,
    projects: fixture.projects,
    employees: fixture.employees,
    brands: fixture.brands,
    departments: fixture.departments,
    brandIdFilter: null,
    departmentIdFilter,
  });
}

// NextRequest rather than a bare Request: the handler's parameter type, so the
// call sites type-check without a cast.
function request(query: string) {
  return new NextRequest(`http://localhost:3000/api/export/detailed/excel?${query}`);
}

describe("detailed export route — handler behavior", () => {
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
      request("startDate=2025-10-01&endDate=2026-01-31&countOnly=true")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 0 });
    expect(mocks.exportDetailedReportToExcel).not.toHaveBeenCalled();
  });

  it("countOnly=true with fixture data returns the real aggregation's row count", async () => {
    mockFixtureEngagements();
    mockFixtureDirectory();

    const expectedRows = realRows(null);
    expect(expectedRows.length).toBeGreaterThan(0); // guard against a vacuous assertion below

    const response = await GET(
      request("startDate=2025-10-01&endDate=2026-01-31&countOnly=true")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: expectedRows.length });
    expect(mocks.exportDetailedReportToExcel).not.toHaveBeenCalled();
  });

  it("departmentIds narrows the count to that department's employees", async () => {
    mockFixtureEngagements();
    mockFixtureDirectory();

    const scoped = realRows(["d1"]);
    expect(scoped.length).toBeLessThan(realRows(null).length); // the filter must bite

    const response = await GET(
      request("startDate=2025-10-01&endDate=2026-01-31&departmentIds=d1&countOnly=true")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: scoped.length });
  });

  it("without countOnly, zero rows returns 404", async () => {
    mocks.getEngagements.mockResolvedValue({ engagements: [], allocations: [] });
    mockEmptyDirectory();

    const response = await GET(request("startDate=2025-10-01&endDate=2026-01-31"));

    expect(response.status).toBe(404);
    expect(mocks.exportDetailedReportToExcel).not.toHaveBeenCalled();
  });

  it("without countOnly, rows present returns the xlsx file", async () => {
    mockFixtureEngagements();
    mockFixtureDirectory();
    mocks.exportDetailedReportToExcel.mockResolvedValue(Buffer.from("fake-xlsx"));
    mocks.generateExcelFilename.mockReturnValue(
      "detailed-data-report-2025-10-01-to-2026-01-31.xlsx"
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const response = await GET(request("startDate=2025-10-01&endDate=2026-01-31"));

    expect(response.status).toBe(200);
    expect(logSpy).not.toHaveBeenCalled();
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(mocks.exportDetailedReportToExcel).toHaveBeenCalledWith(expect.any(Array));
    expect(mocks.generateExcelFilename).toHaveBeenCalledWith("detailed-data-report", {
      start: "2025-10-01",
      end: "2026-01-31",
    });
  });

  it("requires a date range", async () => {
    const response = await GET(request("countOnly=true"));
    expect(response.status).toBe(400);
    expect(mocks.getEngagements).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(request("startDate=2025-10-01&endDate=2026-01-31"));
    expect(response.status).toBe(401);
  });

  it("scopes a non-full-access user to their own engagements", async () => {
    mocks.hasFullAccess.mockResolvedValue(false);
    mocks.getCurrentEmployeeUUID.mockResolvedValue("employee-b");
    mocks.getEngagements.mockResolvedValue({ engagements: [], allocations: [] });
    mockEmptyDirectory();

    await GET(request("startDate=2025-10-01&endDate=2026-01-31&countOnly=true"));

    expect(mocks.getEngagements).toHaveBeenCalledWith(
      expect.objectContaining({ employee_uuid: "employee-b" })
    );
  });
});
