import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dialog = readFileSync("components/export/ExportDialog.tsx", "utf8");

describe("ExportDialog — live record count", () => {
  it("no longer fabricates a random estimate", () => {
    expect(dialog).not.toContain("Math.random");
    expect(dialog).not.toContain("Approximately");
  });

  it("fetches a debounced countOnly pre-flight that is cancelled on cleanup", () => {
    expect(dialog).toContain('params.append("countOnly", "true")');
    expect(dialog).toContain("AbortController");
    expect(dialog).toContain("clearTimeout(timer)");
    expect(dialog).toContain("controller.abort()");
  });

  it("builds params via the shared helper for both the count and the export", () => {
    expect(dialog).toContain("buildExportSearchParams");
    const occurrences = dialog.split("buildExportSearchParams(").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("delegates banner and blocking decisions to the pure module", () => {
    expect(dialog).toContain("resolveExportCountView");
    expect(dialog).toContain("shouldFetchExportCount");
    expect(dialog).toContain("countView.blocksExport");
  });
});
