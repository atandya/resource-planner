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

  it("delegates the count request itself, rather than inlining fetch plumbing", () => {
    // The request's behaviour (countOnly, non-200 handling, malformed bodies)
    // is covered for real in lib/export/fetch-export-count.test.ts.
    expect(dialog).toContain("fetchExportCount(endpoint,");
    expect(dialog).not.toContain('params.append("countOnly", "true")');
  });

  it("builds export params via the shared helper and takes the count URL from the capability module", () => {
    expect(dialog).toContain("buildExportSearchParams(");
    // The count URL comes from countEndpointFor, not from a literal in here.
    // (handleExport's own URL switch still names routes directly — that is a
    // separate concern from the count capability.)
    expect(dialog).toContain("countEndpointFor(exportOption.type)");
    expect(dialog).toContain("fetchExportCount(endpoint,");
  });

  it("delegates banner and blocking decisions to the pure module", () => {
    expect(dialog).toContain("resolveExportCountView");
    expect(dialog).toContain("shouldFetchExportCount");
    expect(dialog).toContain("countView.blocksExport");
  });
});
