import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dialog = readFileSync("components/export/ExportDialog.tsx", "utf8");

describe("ExportDialog — live record count", () => {
  it("no longer fabricates a random estimate", () => {
    expect(dialog).not.toContain("Math.random");
    expect(dialog).not.toContain("Approximately");
  });

  it("debounces the count pre-flight and cancels it on cleanup", () => {
    expect(dialog).toContain("AbortController");
    expect(dialog).toContain("setTimeout");
    expect(dialog).toContain("clearTimeout(timer)");
    expect(dialog).toContain("controller.abort()");
    // A response that lands after cleanup must not overwrite a newer count.
    expect(dialog).toContain("if (controller.signal.aborted) return;");
  });

  it("bounds the pre-flight with a timeout and leaks neither timer", () => {
    // Structural only — the effect itself needs a DOM to exercise. See the
    // note in the task report about why this path has no behavioural test.
    expect(dialog).toContain("COUNT_TIMEOUT_MS");
    expect(dialog).toContain("clearTimeout(timeoutId)");
    // A timeout must surface as an error, not be swallowed as a cancellation.
    expect(dialog).toContain("timedOut = true");
    expect(dialog).toContain("if (timedOut || !controller.signal.aborted)");
  });

  it("delegates the count request itself, rather than inlining fetch plumbing", () => {
    // The request's behaviour (countOnly, non-200 handling, malformed bodies)
    // is covered for real in lib/export/fetch-export-count.test.ts.
    expect(dialog).toContain("fetchExportCount(endpoint,");
    expect(dialog).not.toContain('params.append("countOnly", "true")');
  });

  it("builds export params via the shared helper and takes the count URL from the capability module", () => {
    expect(dialog).toContain("buildExportSearchParams(");
    expect(dialog).toContain("countEndpointFor(exportOption.type)");
    expect(dialog).toContain("fetchExportCount(endpoint,");
    // Neither the count nor the export spells the brand route out here: both
    // resolve to the one constant, so the route cannot move for one and not
    // the other. (The other four types keep their literals — out of scope.)
    expect(dialog).not.toContain("/api/export/brand/excel");
    expect(dialog).toContain("${BRAND_EXPORT_ROUTE}?");
  });

  it("delegates banner and blocking decisions to the pure module", () => {
    expect(dialog).toContain("resolveExportCountView");
    expect(dialog).toContain("shouldFetchExportCount");
    expect(dialog).toContain("countView.blocksExport");
  });
});
