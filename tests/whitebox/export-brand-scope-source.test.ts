import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const field = readFileSync("components/export/BrandScopeField.tsx", "utf8");

describe("BrandScopeField — one product, one filter language", () => {
  it("reuses the timeline's FilterColumn and brand search hook, not a bespoke list", () => {
    expect(field).toContain("FilterColumn");
    expect(field).toContain("usePlannerFilterBrands");
    expect(field).toContain("useDebounce");
  });

  it("is draft + Apply like both neighbours, with Clear resetting to all-brands", () => {
    expect(field).toContain("export-brand-scope-apply");
    expect(field).toContain("export-brand-scope-clear");
    // Draft re-seeds from committed scope on open; abandoned edits leave no trace.
    expect(field).toContain("setDraft(scope)");
    expect(field).toContain("setDraft([])");
  });

  it("labels the trigger via the shared summary rule", () => {
    expect(field).toContain("formatScopeSummary");
    expect(field).toContain('allLabel: "All brands"');
  });

  it("wears the FilterPanel's visual shell", () => {
    expect(field).toContain("bg-muted/30");
    expect(field).toContain("border-t bg-secondary p-2.5");
  });

  it("does not fetch until the popover opens", () => {
    expect(field).toContain("enabled: open");
  });
});
