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

  it("maps every filter to its plural param name", () => {
    const params = buildExportSearchParams({
      dateRange: { start: "2026-07-01", end: "2026-07-31" },
      filters: {
        brandIds: ["b1"],
        departmentIds: ["d1"],
        projectIds: ["p1"],
        employeeIds: ["e1", "e2"],
      },
    });
    expect(params.get("brandIds")).toBe("b1");
    expect(params.get("departmentIds")).toBe("d1");
    expect(params.get("projectIds")).toBe("p1");
    expect(params.get("employeeIds")).toBe("e1,e2");
  });

  it("sends every selected value, not just the first", () => {
    // The regression this guards: a multi-brand timeline filter used to export
    // only brand A, because the caller passed brandIds[0] instead of the array.
    const params = buildExportSearchParams({
      dateRange: { start: "2026-07-01", end: "2026-07-31" },
      filters: {
        brandIds: ["b1", "b2", "b3"],
        departmentIds: ["d1", "d2"],
        projectIds: ["p1", "p2"],
      },
    });
    expect(params.get("brandIds")).toBe("b1,b2,b3");
    expect(params.get("departmentIds")).toBe("d1,d2");
    expect(params.get("projectIds")).toBe("p1,p2");
  });

  it("omits absent and empty filters", () => {
    const params = buildExportSearchParams({
      dateRange: { start: "2026-07-01", end: "2026-07-31" },
      filters: { brandIds: [], employeeIds: [] },
    });
    expect(params.has("brandIds")).toBe(false);
    expect(params.has("employeeIds")).toBe(false);
    expect(params.has("departmentIds")).toBe(false);
  });

  it("drops empty-string entries rather than sending a stray comma", () => {
    // A cleared select can leave "" in the array; "b1," would filter on a
    // non-existent id server-side after split(",").
    const params = buildExportSearchParams({
      dateRange: { start: "2026-07-01", end: "2026-07-31" },
      filters: { brandIds: ["b1", "", "b2"] },
    });
    expect(params.get("brandIds")).toBe("b1,b2");
  });

  it("omits a filter that is entirely empty strings", () => {
    const params = buildExportSearchParams({
      dateRange: { start: "2026-07-01", end: "2026-07-31" },
      filters: { brandIds: [""] },
    });
    expect(params.has("brandIds")).toBe(false);
  });

  it("produces an identical, expected serialized string across repeated calls with the same input", () => {
    const input = {
      dateRange: { start: "2026-07-01", end: "2026-07-31" },
      filters: {
        brandIds: ["b1"],
        departmentIds: ["d1"],
        projectIds: ["p1"],
        employeeIds: ["e1", "e2"],
      },
    };
    const first = buildExportSearchParams(input).toString();
    const second = buildExportSearchParams(input).toString();
    expect(first).toBe(second);
    expect(first).toBe(
      "startDate=2026-07-01&endDate=2026-07-31&brandIds=b1&departmentIds=d1&projectIds=p1&employeeIds=e1%2Ce2",
    );
  });
});
