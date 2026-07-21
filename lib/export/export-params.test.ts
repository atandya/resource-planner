import { describe, expect, it } from "vitest";
import { buildExportSearchParams } from "./export-params";

describe("buildExportSearchParams", () => {
  it("includes dates only when both ends are set", () => {
    expect(
      buildExportSearchParams({ dateRange: { start: "2026-07-01", end: "" } }).toString(),
    ).toBe("");
    expect(
      buildExportSearchParams({ dateRange: { start: "", end: "2026-07-31" } }).toString(),
    ).toBe("");
    expect(
      buildExportSearchParams({ dateRange: { start: "", end: "" } }).toString(),
    ).toBe("");
    const params = buildExportSearchParams({
      dateRange: { start: "2026-07-01", end: "2026-07-31" },
    });
    expect(params.get("startDate")).toBe("2026-07-01");
    expect(params.get("endDate")).toBe("2026-07-31");
  });

  it("maps filters to the API's plural param names", () => {
    const params = buildExportSearchParams({
      dateRange: { start: "2026-07-01", end: "2026-07-31" },
      filters: { brandId: "b1", departmentId: "d1", projectId: "p1", employeeIds: ["e1", "e2"] },
    });
    expect(params.get("brandIds")).toBe("b1");
    expect(params.get("departmentIds")).toBe("d1");
    expect(params.get("projectIds")).toBe("p1");
    expect(params.get("employeeIds")).toBe("e1,e2");
  });

  it("omits empty or null filters", () => {
    const params = buildExportSearchParams({
      dateRange: { start: "2026-07-01", end: "2026-07-31" },
      filters: { brandId: null, employeeIds: [] },
    });
    expect(params.has("brandIds")).toBe(false);
    expect(params.has("employeeIds")).toBe(false);
  });

  it("omits an empty-string filter (cleared select)", () => {
    const params = buildExportSearchParams({
      dateRange: { start: "2026-07-01", end: "2026-07-31" },
      filters: { brandId: "" },
    });
    expect(params.has("brandIds")).toBe(false);
  });

  it("produces an identical, expected serialized string across repeated calls with the same input", () => {
    const input = {
      dateRange: { start: "2026-07-01", end: "2026-07-31" },
      filters: { brandId: "b1", departmentId: "d1", projectId: "p1", employeeIds: ["e1", "e2"] },
    };
    const first = buildExportSearchParams(input).toString();
    const second = buildExportSearchParams(input).toString();
    expect(first).toBe(second);
    expect(first).toBe(
      "startDate=2026-07-01&endDate=2026-07-31&brandIds=b1&departmentIds=d1&projectIds=p1&employeeIds=e1%2Ce2",
    );
  });
});
