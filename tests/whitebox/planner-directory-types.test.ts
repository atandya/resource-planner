import { describe, expect, it } from "vitest";
import {
  buildPlannerProjectKey,
  isPlannerProjectSourceType,
  isPlannerSyncMode,
  isPlannerSyncStatus,
} from "@/lib/planner-directory/types";

describe("planner directory types", () => {
  it("builds deterministic project keys", () => {
    expect(buildPlannerProjectKey("campaign", "abc-123")).toBe("campaign:abc-123");
    expect(buildPlannerProjectKey("pitch", "abc-123")).toBe("pitch:abc-123");
  });

  it("recognizes the allowed source type values", () => {
    expect(isPlannerProjectSourceType("campaign")).toBe(true);
    expect(isPlannerProjectSourceType("pitch")).toBe(true);
    expect(isPlannerProjectSourceType("other")).toBe(false);
  });

  it("recognizes the allowed sync modes and statuses", () => {
    expect(isPlannerSyncMode("full_backfill")).toBe(true);
    expect(isPlannerSyncMode("incremental_refresh")).toBe(true);
    expect(isPlannerSyncMode("targeted_repair")).toBe(true);
    expect(isPlannerSyncMode("manual")).toBe(false);

    expect(isPlannerSyncStatus("queued")).toBe(true);
    expect(isPlannerSyncStatus("running")).toBe(true);
    expect(isPlannerSyncStatus("succeeded")).toBe(true);
    expect(isPlannerSyncStatus("failed")).toBe(true);
    expect(isPlannerSyncStatus("skipped")).toBe(true);
    expect(isPlannerSyncStatus("pending")).toBe(false);
  });
});
