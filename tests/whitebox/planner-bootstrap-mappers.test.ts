import { describe, expect, it } from "vitest";
import type {
  PlannerDirectoryBrandRow,
  PlannerDirectoryDepartmentRow,
  PlannerDirectoryEmployeeRow,
  PlannerDirectoryProjectRow,
} from "@/lib/planner-directory/types";
import {
  toBootstrapBrand,
  toBootstrapDepartment,
  toBootstrapProject,
  toMinimalEmployee,
} from "@/lib/query/server/planner-home-bootstrap";

// The payload diet's wire contract: reference maps ship ONLY the fields the
// client mappers read. A new field sneaking in here is a payload regression.

const projectRow = {
  sourceProjectId: "project-1",
  name: "Campaign",
  color: "#123456",
  status: "active",
  sourceType: "campaign",
  brandId: "brand-1",
  startDate: "2026-06-01",
  endDate: "2026-06-30",
  // sync plumbing that must NOT ship
  sourceHash: "abc",
  syncedAt: "2026-06-12T00:00:00.000Z",
  lastSeenAt: "2026-06-12T00:00:00.000Z",
} as unknown as PlannerDirectoryProjectRow;

const brandRow = {
  brandId: "brand-1",
  name: "Brand",
  companyName: "Company",
  color: "#654321",
  status: "active",
  sourceUpdatedAt: "2026-06-10T00:00:00.000Z",
  syncedAt: "2026-06-12T00:00:00.000Z",
  sourceHash: "def",
  lastSeenAt: "2026-06-12T00:00:00.000Z",
} as unknown as PlannerDirectoryBrandRow;

const departmentRow = {
  departmentId: "dept-1",
  name: "Creative",
  color: "#000037",
  sourceHash: "ghi",
  syncedAt: "2026-06-12T00:00:00.000Z",
} as unknown as PlannerDirectoryDepartmentRow;

describe("planner bootstrap wire mappers", () => {
  it("ships exactly the project fields the client reads", () => {
    expect(Object.keys(toBootstrapProject(projectRow)).sort()).toEqual([
      "brandId",
      "color",
      "endDate",
      "name",
      "sourceProjectId",
      "sourceType",
      "startDate",
      "status",
      "submitDate",
    ]);
  });

  it("ships exactly the brand fields the client reads", () => {
    expect(Object.keys(toBootstrapBrand(brandRow)).sort()).toEqual([
      "brandId",
      "color",
      "companyName",
      "name",
      "sourceUpdatedAt",
      "status",
      "syncedAt",
    ]);
  });

  it("ships exactly the department fields the client reads", () => {
    expect(Object.keys(toBootstrapDepartment(departmentRow)).sort()).toEqual([
      "color",
      "departmentId",
      "name",
    ]);
  });

  // Bootstrap rows are the timeline's ONLY employee rows (complete-list path
  // retired), so the wire shape must carry every field the client reads —
  // including departmentId, which the department filter compares against.
  // Dropping a field here silently breaks a client filter, not a type check.
  it("ships the employee fields the row model and filters read, including departmentId", () => {
    const employeeRow = {
      employeeUuid: "emp-1",
      fullName: "Alpha Person",
      position: "Designer",
      departmentId: "dept-1",
      weeklyCapacity: 40,
      sourceHash: "jkl",
      syncedAt: "2026-06-12T00:00:00.000Z",
      lastSeenAt: "2026-06-12T00:00:00.000Z",
    } as unknown as PlannerDirectoryEmployeeRow;
    const minimal = toMinimalEmployee(employeeRow, {
      "dept-1": { departmentId: "dept-1", name: "Creative", color: "#000037" },
    });

    expect(Object.keys(minimal).sort()).toEqual([
      "department",
      "departmentId",
      "employmentStatus",
      "fullName",
      "id",
      "position",
      "sourceEmployeeId",
      "weeklyCapacity",
    ]);
    expect(minimal.departmentId).toBe("dept-1");
    expect(minimal.department).toEqual({ id: "dept-1", name: "Creative", color: "#000037" });
  });
});
