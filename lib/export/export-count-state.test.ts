import { describe, expect, it } from "vitest";
import {
  countEndpointFor,
  resolveExportCountView,
  shouldFetchExportCount,
} from "./export-count-state";
import type { ExportType } from "./export-types";

const RANGE = { start: "2026-07-01", end: "2026-07-31" };

const UNCOUNTABLE: ExportType[] = ["assignments", "utilization", "projects", "conflicts"];

describe("countEndpointFor", () => {
  it("returns each countable export type's own endpoint", () => {
    expect(countEndpointFor("detailed")).toBe("/api/export/detailed/excel");
    expect(countEndpointFor("brand")).toBe("/api/export/brand/excel");
  });

  it("returns null for every export type without a count endpoint", () => {
    for (const type of UNCOUNTABLE) {
      expect(countEndpointFor(type)).toBeNull();
    }
  });
});

describe("shouldFetchExportCount", () => {
  it("fetches only when open, brand-typed, and the range is complete", () => {
    expect(shouldFetchExportCount({ open: true, exportType: "brand", dateRange: RANGE })).toBe(true);
  });

  it("does not fetch when the dialog is closed", () => {
    expect(shouldFetchExportCount({ open: false, exportType: "brand", dateRange: RANGE })).toBe(false);
  });

  it("does not fetch for export types without a count endpoint", () => {
    expect(shouldFetchExportCount({ open: true, exportType: "assignments", dateRange: RANGE })).toBe(false);
  });

  it("does not fetch on a partial range", () => {
    expect(
      shouldFetchExportCount({ open: true, exportType: "brand", dateRange: { start: "2026-07-01", end: "" } }),
    ).toBe(false);
    expect(
      shouldFetchExportCount({ open: true, exportType: "brand", dateRange: { start: "", end: "2026-07-31" } }),
    ).toBe(false);
  });
});

describe("resolveExportCountView", () => {
  it("shows nothing and never blocks for types without a count endpoint", () => {
    expect(
      resolveExportCountView({ exportType: "assignments", status: "ready", count: 0 }),
    ).toEqual({ banner: null, blocksExport: false });
  });

  it("shows a loading banner while counting, without blocking", () => {
    expect(resolveExportCountView({ exportType: "brand", status: "loading", count: null })).toEqual({
      banner: { kind: "loading" },
      blocksExport: false,
    });
  });

  it("shows the count once ready", () => {
    expect(resolveExportCountView({ exportType: "brand", status: "ready", count: 42 })).toEqual({
      banner: { kind: "count", count: 42 },
      blocksExport: false,
    });
  });

  it("blocks the export only when the count is known to be zero", () => {
    expect(resolveExportCountView({ exportType: "brand", status: "ready", count: 0 })).toEqual({
      banner: { kind: "empty" },
      blocksExport: true,
    });
  });

  it("never blocks when the count is unknown", () => {
    // A failed or in-flight count must not strand the user with a dead button.
    for (const status of ["idle", "loading", "error"] as const) {
      expect(resolveExportCountView({ exportType: "brand", status, count: null }).blocksExport).toBe(false);
    }
    expect(resolveExportCountView({ exportType: "brand", status: "error", count: null }).banner).toBeNull();
  });
});
