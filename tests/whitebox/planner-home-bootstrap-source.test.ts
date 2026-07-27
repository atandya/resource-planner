import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("planner home bootstrap server composer", () => {
  it("defines a compact home bootstrap contract", () => {
    const source = readFileSync("lib/query/server/planner-home-bootstrap.ts", "utf8");

    expect(source).toContain("export type PlannerHomeBootstrapRequest");
    expect(source).toContain("export type PlannerHomeBootstrapResponse");
    expect(source).toContain("MinimalTimelineEmployee");
    expect(source).toContain("fetchPlannerHomeBootstrap");
    expect(source).toContain("fetchPlannerTimeline");
    expect(source).toContain("plannerDirectoryRepository.listTimelineEmployees");
    expect(source).toContain("plannerDirectoryRepository.listProjectsForBootstrap");
    expect(source).toContain("plannerDirectoryRepository.listBrandsByIds");
    expect(source).toContain("metadataPartial: boolean");
    expect(source).toContain("freshness: {");
    expect(source).toContain("directoryFetchedAt: string");
    expect(source).not.toContain("metadataFreshness");
    expect(source).not.toContain("fetchOrderedEmployeeSlice");
    expect(source).not.toContain("fetchProjectSummaries");
  });
});
