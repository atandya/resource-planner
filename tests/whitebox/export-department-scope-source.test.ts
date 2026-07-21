import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const field = readFileSync("components/export/DepartmentScopeField.tsx", "utf8");

describe("DepartmentScopeField — the main page's department checklist, as a scope field", () => {
  it("reuses FilterColumn as a searchless always-visible checklist", () => {
    expect(field).toContain("FilterColumn");
    expect(field).toContain("useDepartments");
    // Mirrors FilterPanel's department column: no search box, checklist inline.
    expect(field).toContain("search={null}");
    expect(field).not.toContain("useDebounce");
  });

  it("is draft + Apply with Clear resetting to all departments", () => {
    expect(field).toContain("export-department-scope-apply");
    expect(field).toContain("export-department-scope-clear");
    expect(field).toContain("setDraft(scope)");
    expect(field).toContain("setDraft([])");
  });

  it("labels the trigger via the shared summary rule", () => {
    expect(field).toContain("formatScopeSummary");
    expect(field).toContain('allLabel: "All departments"');
  });

  it("wears the FilterPanel's visual shell", () => {
    expect(field).toContain("bg-muted/30");
    expect(field).toContain("border-t bg-secondary p-2.5");
  });
});
