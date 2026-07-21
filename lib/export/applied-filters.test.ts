import { describe, expect, it } from "vitest";
import { describeAppliedFilters, honorsFilter, selectHonoredFilters } from "./applied-filters";

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

    expect(honorsFilter("projects", "brandIds")).toBe(true);
    expect(honorsFilter("projects", "projectIds")).toBe(true);

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
    expect(selectHonoredFilters("projects", ALL_FILTERS)).toEqual({
      brandIds: ["b1", "b2"],
      projectIds: ["p1"],
    });
  });

  it("omits empty and blank selections", () => {
    expect(selectHonoredFilters("brand", { brandIds: [] })).toEqual({});
    expect(selectHonoredFilters("brand", { brandIds: [""] })).toEqual({});
    expect(selectHonoredFilters("brand", undefined)).toEqual({});
  });
});

describe("describeAppliedFilters", () => {
  it("says nothing about filters the export ignores", () => {
    // A brand export must not claim a department filter it throws away.
    const described = describeAppliedFilters({ exportType: "brand", filters: ALL_FILTERS });
    expect(described.map((entry) => entry.key)).toEqual(["brandIds"]);
  });

  it("names every selected brand when names are supplied", () => {
    const described = describeAppliedFilters({
      exportType: "brand",
      filters: { brandIds: ["b1", "b2", "b3"] },
      names: { brandIds: ["Acme", "Globex", "Initech"] },
    });
    expect(described).toEqual([
      { key: "brandIds", label: "Brands", value: "Acme, Globex, Initech" },
    ]);
  });

  it("uses the singular label for exactly one selection", () => {
    const described = describeAppliedFilters({
      exportType: "brand",
      filters: { brandIds: ["b1"] },
      names: { brandIds: ["Acme"] },
    });
    expect(described).toEqual([{ key: "brandIds", label: "Brand", value: "Acme" }]);
  });

  it("falls back to a count rather than printing raw ids", () => {
    const described = describeAppliedFilters({
      exportType: "brand",
      filters: { brandIds: ["206", "341"] },
    });
    expect(described).toEqual([{ key: "brandIds", label: "Brands", value: "2 selected" }]);
  });

  it("falls back to a count when names are incomplete", () => {
    // A partial name list would silently misreport which brands are included.
    const described = describeAppliedFilters({
      exportType: "brand",
      filters: { brandIds: ["b1", "b2"] },
      names: { brandIds: ["Acme"] },
    });
    expect(described).toEqual([{ key: "brandIds", label: "Brands", value: "2 selected" }]);
  });

  it("returns nothing when no honored filter is active", () => {
    expect(
      describeAppliedFilters({ exportType: "conflicts", filters: { brandIds: ["b1"] } }),
    ).toEqual([]);
    expect(describeAppliedFilters({ exportType: "brand" })).toEqual([]);
  });
});
