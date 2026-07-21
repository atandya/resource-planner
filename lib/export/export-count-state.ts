/**
 * Decision logic for the export dialog's live record count.
 *
 * Lives outside the component so the banner states and the "nothing to
 * export" guard are unit-testable without a DOM. The dialog renders what
 * these functions decide and holds no branching of its own.
 */

import type { ExportType } from "./export-types";

export type ExportCountStatus = "idle" | "loading" | "ready" | "error";

export type ExportCountBanner =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "count"; count: number };

export interface ExportCountView {
  /** Banner to render, or null to render nothing at all. */
  banner: ExportCountBanner | null;
  /** True only when the count is known to be zero, so the export is certain to yield an empty file. */
  blocksExport: boolean;
}

/**
 * The brand report's route. Exported because the dialog's real export fetch
 * targets the same path as the count pre-flight — if this ever moves, both
 * requests must move with it, and a second literal elsewhere would let the
 * count silently break (404 → error → banner disappears) while the export
 * kept working.
 */
export const BRAND_EXPORT_ROUTE = "/api/export/brand/excel";

/**
 * The countOnly pre-flight route for an export type, or null when that type
 * has no count endpoint.
 *
 * Whether a type can be counted and where its count comes from are the same
 * decision, so they are one function: a countable type cannot end up pointing
 * at another type's route, and adding a second countable type is a single edit.
 */
export function countEndpointFor(exportType: ExportType): string | null {
  return exportType === "brand" ? BRAND_EXPORT_ROUTE : null;
}

export function shouldFetchExportCount(input: {
  open: boolean;
  exportType: ExportType;
  dateRange: { start: string; end: string };
}): boolean {
  return (
    input.open &&
    countEndpointFor(input.exportType) !== null &&
    Boolean(input.dateRange.start) &&
    Boolean(input.dateRange.end)
  );
}

export function resolveExportCountView(input: {
  exportType: ExportType;
  status: ExportCountStatus;
  count: number | null;
}): ExportCountView {
  if (countEndpointFor(input.exportType) === null) {
    return { banner: null, blocksExport: false };
  }
  if (input.status === "loading") {
    return { banner: { kind: "loading" }, blocksExport: false };
  }
  if (input.status === "ready" && typeof input.count === "number") {
    return input.count === 0
      ? { banner: { kind: "empty" }, blocksExport: true }
      : { banner: { kind: "count", count: input.count }, blocksExport: false };
  }
  // idle, error, or ready without a usable number: say nothing, block nothing.
  return { banner: null, blocksExport: false };
}
