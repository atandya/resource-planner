import { describe, expect, it } from "vitest";
import { honorsFilter, selectHonoredFilters } from "./applied-filters";

const ALL_FILTERS = {
  brandIds: ["b1", "b2"],
  departmentIds: ["d1"],
  projectIds: ["p1"],
  employeeIds: ["e1"],
};

describe("honorsFilter", () => {
  it("matches what each export route actually reads", () => {
    expect(honorsFilter("brand", "brandIds")).toBe(true);
    // The brand route reads only startDate/endDate/brandIds.
    expect(honorsFilter("brand", "departmentIds")).toBe(false);
    expect(honorsFilter("brand", "projectIds")).toBe(false);

    expect(honorsFilter("projects", "projectIds")).toBe(true);
    // The projects routes parse brandIds and then discard it — see the
    // "not implemented" branch in app/api/export/projects/route.ts. Claiming it
    // would tell the user a brand scope the file doesn't actually have.
    expect(honorsFilter("projects", "brandIds")).toBe(false);

    expect(honorsFilter("assignments", "projectIds")).toBe(true);
    expect(honorsFilter("assignments", "brandIds")).toBe(false);

    expect(honorsFilter("utilization", "departmentIds")).toBe(true);
    expect(honorsFilter("utilization", "employeeIds")).toBe(true);

    expect(honorsFilter("conflicts", "employeeIds")).toBe(true);
    expect(honorsFilter("conflicts", "brandIds")).toBe(false);
  });
});

describe("selectHonoredFilters", () => {
  it("keeps only what the export will apply", () => {
    expect(selectHonoredFilters("brand", ALL_FILTERS)).toEqual({ brandIds: ["b1", "b2"] });
    expect(selectHonoredFilters("conflicts", ALL_FILTERS)).toEqual({ employeeIds: ["e1"] });
    expect(selectHonoredFilters("projects", ALL_FILTERS)).toEqual({ projectIds: ["p1"] });
    expect(selectHonoredFilters("assignments", ALL_FILTERS)).toEqual({ projectIds: ["p1"] });
    expect(selectHonoredFilters("utilization", ALL_FILTERS)).toEqual({
      departmentIds: ["d1"],
      employeeIds: ["e1"],
    });
  });

  it("omits empty and blank selections", () => {
    expect(selectHonoredFilters("brand", { brandIds: [] })).toEqual({});
    expect(selectHonoredFilters("brand", { brandIds: [""] })).toEqual({});
    expect(selectHonoredFilters("brand", undefined)).toEqual({});
  });
});
