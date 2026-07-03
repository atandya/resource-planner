import { describe, expect, it } from "vitest";
import { getDefaultAssignmentRange } from "@/lib/assignments/split";

describe("getDefaultAssignmentRange", () => {
  it("uses the project start/end when both are known", () => {
    expect(
      getDefaultAssignmentRange({ startDate: "2026-06-01", endDate: "2026-06-30" })
    ).toEqual({ startDate: "2026-06-01", endDate: "2026-06-30" });
  });

  it("spans exactly the submit month for a pitch", () => {
    expect(
      getDefaultAssignmentRange({
        projectType: "pitch",
        submitDate: "2026-07-15",
        startDate: null,
        endDate: null,
      })
    ).toEqual({ startDate: "2026-07-01", endDate: "2026-07-31" });
  });

  it("prefers the submit month over project dates for a pitch", () => {
    expect(
      getDefaultAssignmentRange({
        projectType: "pitch",
        submitDate: "2026-02-10",
        startDate: "2026-01-01",
        endDate: "2026-03-31",
      })
    ).toEqual({ startDate: "2026-02-01", endDate: "2026-02-28" });
  });

  it("falls back to today through one month out for a pitch without a submit date", () => {
    const today = new Date("2026-06-10T00:00:00");
    expect(
      getDefaultAssignmentRange(
        { projectType: "pitch", submitDate: null, startDate: null, endDate: null },
        today
      )
    ).toEqual({ startDate: "2026-06-10", endDate: "2026-07-10" });
  });
});
