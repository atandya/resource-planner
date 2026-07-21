import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const button = readFileSync("components/export/ExportButton.tsx", "utf8");
const flag = readFileSync("lib/export/brand-report-flag.ts", "utf8");

/**
 * The Brand Report export is parked (feature works end to end, deliberately
 * hidden while iterated on). The menu must render the gated list, and the gate
 * must key on the shared flag — not delete the option definition, which stays
 * so flipping the flag revives the report intact.
 */
describe("Brand Report export — parked behind its flag", () => {
  it("is currently off", () => {
    expect(flag).toContain("BRAND_REPORT_EXPORT_ENABLED = false");
  });

  it("gates the menu on the flag instead of deleting the option", () => {
    expect(button).toContain("BRAND_REPORT_EXPORT_ENABLED");
    expect(button).toContain('option.type !== "brand" || BRAND_REPORT_EXPORT_ENABLED');
    expect(button).toContain("VISIBLE_EXPORT_OPTIONS.map");
    // The definition survives for the flip back.
    expect(button).toContain('type: "brand"');
    expect(button).toContain('label: "Brand Report"');
  });
});
