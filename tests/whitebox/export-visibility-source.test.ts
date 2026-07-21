import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const button = readFileSync("components/export/ExportButton.tsx", "utf8");
const visibility = readFileSync("lib/export/export-visibility.ts", "utf8");

/**
 * Only the Detailed Data Report is live; Brand Report and the four raw exports
 * are parked. Definitions all survive — reviving any report is a one-line edit
 * to VISIBLE_EXPORT_TYPES, not a code restoration.
 */
describe("export menu visibility", () => {
  it("shows only the detailed report", () => {
    expect(visibility).toContain('= ["detailed"]');
  });

  it("gates the menu on the shared list instead of deleting options", () => {
    expect(button).toContain("VISIBLE_EXPORT_TYPES");
    expect(button).toContain("VISIBLE_EXPORT_OPTIONS.map");
    for (const label of ["Assignments", "Utilization Report", "Project Status", "Conflicts Report", "Brand Report", "Detailed Data Report"]) {
      expect(button).toContain(`label: "${label}"`);
    }
  });
});
