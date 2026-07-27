import { describe, it, expect } from "vitest";
import { getTimelineColumns, getTimelineExportDateRange, getTimelineResolution } from "./date-range";

describe("custom view mode", () => {
  it("resolves to month resolution", () => {
    expect(getTimelineResolution("custom")).toBe("month");
  });

  it("builds one column per month across the custom range, inclusive", () => {
    const set = getTimelineColumns({
      anchorDate: new Date(2026, 0, 1),
      viewMode: "custom",
      showWeekends: false,
      customRange: { start: new Date(2026, 6, 1), end: new Date(2026, 11, 1) },
    });
    expect(set.resolution).toBe("month");
    expect(set.columns).toHaveLength(6);
    expect(set.columns[0].label).toBe("July");
    expect(set.columns[5].label).toBe("December");
    expect(set.startDate).toBe("2026-07-01");
    expect(set.endDate).toBe("2026-12-31");
  });

  it("supports a cross-year custom range", () => {
    const set = getTimelineColumns({
      anchorDate: new Date(2026, 0, 1),
      viewMode: "custom",
      showWeekends: false,
      customRange: { start: new Date(2026, 10, 1), end: new Date(2027, 1, 1) },
    });
    expect(set.columns).toHaveLength(4);
    expect(set.startDate).toBe("2026-11-01");
    expect(set.endDate).toBe("2027-02-28");
  });
});

describe("getTimelineExportDateRange", () => {
  it("returns null before the anchor is seeded", () => {
    expect(getTimelineExportDateRange({ anchorDate: null, viewMode: "quarter" })).toBeNull();
  });

  it("snaps a week within one month to that whole month", () => {
    // Week of Mon 2026-07-06 lies entirely in July.
    expect(
      getTimelineExportDateRange({ anchorDate: new Date(2026, 6, 6), viewMode: "week" }),
    ).toEqual({ startDate: "2026-07-01", endDate: "2026-07-31" });
  });

  it("snaps a week spanning two months to both whole months", () => {
    // Week of Mon 2026-06-29 runs into July.
    expect(
      getTimelineExportDateRange({ anchorDate: new Date(2026, 5, 29), viewMode: "week" }),
    ).toEqual({ startDate: "2026-06-01", endDate: "2026-07-31" });
  });

  it("returns the quarter containing the anchor", () => {
    expect(
      getTimelineExportDateRange({ anchorDate: new Date(2026, 7, 15), viewMode: "quarter" }),
    ).toEqual({ startDate: "2026-07-01", endDate: "2026-09-30" });
  });

  it("returns the custom range expanded to whole months", () => {
    expect(
      getTimelineExportDateRange({
        anchorDate: new Date(2026, 0, 1),
        viewMode: "custom",
        customRange: { start: new Date(2026, 10, 1), end: new Date(2027, 1, 1) },
      }),
    ).toEqual({ startDate: "2026-11-01", endDate: "2027-02-28" });
  });
});
