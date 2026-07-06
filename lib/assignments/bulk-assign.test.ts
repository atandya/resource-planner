import { describe, it, expect } from "vitest";
import { deriveProjectSpan, summarizeBulkAssign, applyHoursToAll, buildBulkAssignOperations, isAssignableProject, filterProjectsByName } from "./bulk-assign";

describe("deriveProjectSpan", () => {
  it("returns start/end for a campaign that has both dates", () => {
    expect(
      deriveProjectSpan({ projectType: "campaign", startDate: "2026-04-01", endDate: "2026-08-31" }),
    ).toEqual({ startDate: "2026-04-01", endDate: "2026-08-31" });
  });

  it("returns null for a campaign missing either date", () => {
    expect(deriveProjectSpan({ projectType: "campaign", startDate: "2026-04-01", endDate: null })).toBeNull();
    expect(deriveProjectSpan({ projectType: "campaign", startDate: null, endDate: null })).toBeNull();
  });

  it("spans the full submit month for a pitch (same as the single-assign default)", () => {
    expect(
      deriveProjectSpan({ projectType: "pitch", startDate: null, endDate: null, submitDate: "2026-05-10" }),
    ).toEqual({ startDate: "2026-05-01", endDate: "2026-05-31" });
  });

  it("returns null for a pitch with no submitDate, even when startDate is set", () => {
    expect(deriveProjectSpan({ projectType: "pitch", startDate: "2026-05-10", endDate: null })).toBeNull();
    expect(deriveProjectSpan({ projectType: "pitch", startDate: null, endDate: null })).toBeNull();
  });

  it("coerces verbose driver date strings to strict yyyy-MM-dd", () => {
    // ProjectOption.startDate/endDate arrive as String(Date) from the planner DB
    // driver, e.g. "Wed Jun 18 2025 00:00:00 GMT+0700 (...)". Passing these
    // straight to splitTotalAcrossMonths yields Invalid Date -> zero allocations.
    expect(
      deriveProjectSpan({
        projectType: "campaign",
        startDate: "Wed Apr 01 2026 00:00:00 GMT+0700 (Western Indonesia Time)",
        endDate: "Mon Aug 31 2026 00:00:00 GMT+0700 (Western Indonesia Time)",
      }),
    ).toEqual({ startDate: "2026-04-01", endDate: "2026-08-31" });
  });

  it("coerces 'yyyy-MM-dd HH:mm:ss' timestamps to date-only", () => {
    expect(
      deriveProjectSpan({ projectType: "campaign", startDate: "2026-04-01 00:00:00", endDate: "2026-08-31 00:00:00" }),
    ).toEqual({ startDate: "2026-04-01", endDate: "2026-08-31" });
  });
});

describe("buildBulkAssignOperations with verbose driver dates (regression)", () => {
  it("produces non-empty monthlyHours for verbose campaign dates", () => {
    const ops = buildBulkAssignOperations({
      members: [{ id: "m1" }],
      projects: [
        {
          projectKey: "campaign:1",
          projectType: "campaign",
          startDate: "Wed Apr 01 2026 00:00:00 GMT+0700 (Western Indonesia Time)",
          endDate: "Wed Jun 30 2026 00:00:00 GMT+0700 (Western Indonesia Time)",
        },
      ],
      hoursByMember: { m1: "30" },
    });
    expect(ops).toHaveLength(1);
    // Before the date-coercion fix this was {} (Invalid Date -> no months) and hours were lost.
    // Per-month semantics: 30 hrs/month lands on every month of the span (not 30 split across).
    expect(ops[0].monthlyHours).toEqual({
      "2026-04-01": 30,
      "2026-05-01": 30,
      "2026-06-01": 30,
    });
    expect(ops[0].span).toEqual({ startDate: "2026-04-01", endDate: "2026-06-30" });
  });
});

describe("summarizeBulkAssign", () => {
  const campaign = { projectType: "campaign" as const, startDate: "2026-04-01", endDate: "2026-08-31" };
  const noDates = { projectType: "campaign" as const, startDate: null, endDate: null };

  it("multiplies member count by the number of assignable projects", () => {
    expect(summarizeBulkAssign(2, [campaign, campaign])).toEqual({
      assignableProjectCount: 2,
      skippedCount: 0,
      totalAssignments: 4,
    });
  });

  it("excludes projects with no usable dates from the count", () => {
    expect(summarizeBulkAssign(3, [campaign, noDates])).toEqual({
      assignableProjectCount: 1,
      skippedCount: 1,
      totalAssignments: 3,
    });
  });

  it("returns zero assignments when there are no members", () => {
    expect(summarizeBulkAssign(0, [campaign])).toEqual({
      assignableProjectCount: 1,
      skippedCount: 0,
      totalAssignments: 0,
    });
  });
});

describe("applyHoursToAll", () => {
  it("maps every member id to the given value", () => {
    expect(applyHoursToAll(["a", "b", "c"], "8")).toEqual({ a: "8", b: "8", c: "8" });
  });

  it("returns an empty record when there are no members", () => {
    expect(applyHoursToAll([], "8")).toEqual({});
  });
});

describe("buildBulkAssignOperations", () => {
  const projA = { id: "pA", projectKey: "keyA", projectType: "campaign" as const, startDate: "2026-04-01", endDate: "2026-06-30" };
  const projB = { id: "pB", projectKey: "keyB", projectType: "campaign" as const, startDate: "2026-07-01", endDate: "2026-07-31" };
  const noDates = { id: "pX", projectKey: "keyX", projectType: "campaign" as const, startDate: null, endDate: null };

  it("creates one operation per member per assignable project", () => {
    const ops = buildBulkAssignOperations({
      members: [{ id: "m1" }, { id: "m2" }],
      projects: [projA, projB],
      hoursByMember: { m1: "30", m2: "30" },
    });
    expect(ops).toHaveLength(4);
    expect(ops.map((o) => [o.employeeUuid, o.projectKey])).toEqual([
      ["m1", "keyA"],
      ["m1", "keyB"],
      ["m2", "keyA"],
      ["m2", "keyB"],
    ]);
  });

  it("skips projects with no usable dates", () => {
    const ops = buildBulkAssignOperations({
      members: [{ id: "m1" }],
      projects: [projA, noDates],
      hoursByMember: { m1: "30" },
    });
    expect(ops).toHaveLength(1);
    expect(ops[0].projectKey).toBe("keyA");
  });

  it("applies the value as hours-per-month to EACH project (flat, not divided)", () => {
    const ops = buildBulkAssignOperations({
      members: [{ id: "m1" }],
      projects: [projA, projB], // projA = Apr–Jun (3 months), projB = Jul (1 month)
      hoursByMember: { m1: "30" },
    });
    // projA: 30/month across 3 months
    expect(ops[0].monthlyHours).toEqual({
      "2026-04-01": 30,
      "2026-05-01": 30,
      "2026-06-01": 30,
    });
    // projB: 30 in its single month
    expect(ops[1].monthlyHours).toEqual({ "2026-07-01": 30 });
  });

  it("treats blank or invalid hours as zero", () => {
    const ops = buildBulkAssignOperations({
      members: [{ id: "m1" }],
      projects: [projB],
      hoursByMember: {},
    });
    expect(ops[0].monthlyHours).toEqual({ "2026-07-01": 0 });
  });

  it("stamps every operation as a draft merge", () => {
    const ops = buildBulkAssignOperations({
      members: [{ id: "m1" }],
      projects: [projA],
      hoursByMember: { m1: "12" },
    });
    expect(ops[0].status).toBe("draft");
    expect(ops[0].mode).toBe("merge");
    expect(ops[0].span).toEqual({ startDate: "2026-04-01", endDate: "2026-06-30" });
  });
});

describe("pitch bulk-assign", () => {
  const pitch = { projectKey: "pitch:1", projectType: "pitch" as const, startDate: null, endDate: null, submitDate: "2026-05-10" };
  const undatedPitch = { projectKey: "pitch:2", projectType: "pitch" as const, startDate: "2026-05-10", endDate: null, submitDate: null };
  const campaign = { projectKey: "campaign:1", projectType: "campaign" as const, startDate: "2026-04-01", endDate: "2026-06-30" };

  it("isAssignableProject is true for a pitch with a submitDate, false without", () => {
    expect(isAssignableProject(pitch)).toBe(true);
    expect(isAssignableProject(undatedPitch)).toBe(false);
    expect(isAssignableProject(campaign)).toBe(true);
  });

  it("buildBulkAssignOperations plans a pitch across its submit month", () => {
    const ops = buildBulkAssignOperations({
      members: [{ id: "m1" }],
      projects: [pitch, campaign],
      hoursByMember: { m1: "30" },
    });
    expect(ops).toHaveLength(2);
    expect(ops[0].projectKey).toBe("pitch:1");
    expect(ops[0].span).toEqual({ startDate: "2026-05-01", endDate: "2026-05-31" });
    expect(ops[0].monthlyHours).toEqual({ "2026-05-01": 30 });
  });

  it("buildBulkAssignOperations skips a pitch with no submitDate", () => {
    const ops = buildBulkAssignOperations({
      members: [{ id: "m1" }],
      projects: [undatedPitch, campaign],
      hoursByMember: { m1: "30" },
    });
    expect(ops).toHaveLength(1);
    expect(ops[0].projectKey).toBe("campaign:1");
  });

  it("summarizeBulkAssign counts a dated pitch as assignable and an undated one as skipped", () => {
    expect(summarizeBulkAssign(1, [pitch, undatedPitch, campaign])).toEqual({
      assignableProjectCount: 2,
      skippedCount: 1,
      totalAssignments: 2,
    });
  });
});

describe("filterProjectsByName", () => {
  const projects = [
    { name: "Pegadaian Tiktok" },
    { name: "Pegadaian IG" },
    { name: "BRI Prioritas" },
  ];

  it("returns all projects when the query is empty or whitespace", () => {
    expect(filterProjectsByName(projects, "")).toEqual(projects);
    expect(filterProjectsByName(projects, "   ")).toEqual(projects);
  });

  it("matches a case-insensitive substring of the name", () => {
    expect(filterProjectsByName(projects, "pega")).toEqual([
      { name: "Pegadaian Tiktok" },
      { name: "Pegadaian IG" },
    ]);
    expect(filterProjectsByName(projects, "BRI")).toEqual([{ name: "BRI Prioritas" }]);
  });

  it("trims surrounding whitespace before matching", () => {
    expect(filterProjectsByName(projects, "  ig ")).toEqual([{ name: "Pegadaian IG" }]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterProjectsByName(projects, "zzz")).toEqual([]);
  });
});
