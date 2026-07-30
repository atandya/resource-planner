import { describe, it, expect } from "vitest";
import { getOverCapacityMonths, sumExistingMonthlyHours } from "./capacity-warning";

describe("getOverCapacityMonths", () => {
  it("returns [] when totals stay at or under capacity", () => {
    expect(
      getOverCapacityMonths({
        existingByMonth: { "2026-03-01": 100 },
        proposedByMonth: { "2026-03-01": 60 },
      }),
    ).toEqual([]);
  });

  it("does not flag exactly 160 (rounding drift shouldn't false-positive)", () => {
    expect(
      getOverCapacityMonths({
        existingByMonth: { "2026-03-01": 100.4 },
        proposedByMonth: { "2026-03-01": 59.6 },
      }),
    ).toEqual([]);
  });

  it("flags a month at 161", () => {
    expect(
      getOverCapacityMonths({
        existingByMonth: { "2026-03-01": 100 },
        proposedByMonth: { "2026-03-01": 61 },
      }),
    ).toEqual([
      {
        month: "2026-03-01",
        monthLabel: "Mar 2026",
        existingHours: 100,
        proposedHours: 61,
        totalHours: 161,
      },
    ]);
  });

  it("only flags the offending month in a multi-month span", () => {
    const result = getOverCapacityMonths({
      existingByMonth: { "2026-03-01": 150, "2026-04-01": 20 },
      proposedByMonth: { "2026-03-01": 20, "2026-04-01": 20 },
    });
    expect(result.map((m) => m.month)).toEqual(["2026-03-01"]);
    expect(result[0].totalHours).toBe(170);
  });

  it("flags a month over capacity from existing hours alone plus a small addition", () => {
    expect(
      getOverCapacityMonths({
        existingByMonth: { "2026-03-01": 170 },
        proposedByMonth: { "2026-03-01": 5 },
      }),
    ).toEqual([
      {
        month: "2026-03-01",
        monthLabel: "Mar 2026",
        existingHours: 170,
        proposedHours: 5,
        totalHours: 175,
      },
    ]);
  });

  it("treats missing existing data for a month as zero", () => {
    expect(
      getOverCapacityMonths({
        existingByMonth: {},
        proposedByMonth: { "2026-03-01": 100 },
      }),
    ).toEqual([]);
  });

  it("returns [] when proposedByMonth is empty", () => {
    expect(
      getOverCapacityMonths({
        existingByMonth: { "2026-03-01": 200 },
        proposedByMonth: {},
      }),
    ).toEqual([]);
  });
});

describe("sumExistingMonthlyHours", () => {
  it("sums allocations across assignments, excluding the given project", () => {
    const result = sumExistingMonthlyHours(
      [
        {
          projectKey: "proj-a",
          allocations: [
            { month: "2026-03-01", plannedHours: 80 },
            { month: "2026-04-01", plannedHours: 40 },
          ],
        },
        {
          projectKey: "proj-b",
          allocations: [{ month: "2026-03-01", plannedHours: 30 }],
        },
        {
          projectKey: "proj-c",
          allocations: [{ month: "2026-03-01", plannedHours: 1000 }],
        },
      ],
      "proj-c",
    );
    expect(result).toEqual({ "2026-03-01": 110, "2026-04-01": 40 });
  });

  it("returns {} for no assignments", () => {
    expect(sumExistingMonthlyHours([], "proj-a")).toEqual({});
  });
});
