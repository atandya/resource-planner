import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const home = readFileSync("app/HomeClient.tsx", "utf8");

/**
 * Guards the file where the truncation bug actually lived. The export filters
 * are multi-select, but HomeClient used to hand the dialog `appliedBrandIds[0]`,
 * so filtering the timeline to three brands exported one. Every other test for
 * this feature sits in lib/export, which would stay green if that returned.
 */
describe("HomeClient — export filter wiring", () => {
  const exportButtonProps = home.slice(
    home.indexOf("<ExportButton"),
    home.indexOf("/>", home.indexOf("<ExportButton")),
  );

  it("renders an ExportButton whose props we can inspect", () => {
    expect(exportButtonProps).toContain("filters=");
  });

  it("passes whole filter arrays, never just the first selection", () => {
    expect(exportButtonProps).toContain("brandIds: appliedBrandIds");
    expect(exportButtonProps).toContain("departmentIds: appliedDepartmentIds");
    expect(exportButtonProps).toContain("projectIds: appliedProjectIds");
    // The regression: any [0] indexing here narrows the export to one id.
    expect(exportButtonProps).not.toMatch(/applied\w+\[0\]/);
  });

  it("supplies brand display names so the dialog need not print raw ids", () => {
    expect(exportButtonProps).toContain("filterNames=");
    expect(home).toContain("appliedBrands.map((b) => [b.id, b.name])");
  });

  it("keeps the timeline and the export on the same applied brand ids", () => {
    // Both read appliedBrandIds; if the export ever diverges from the timeline,
    // the file stops matching what the user is looking at.
    expect(home).toContain("brandIds: appliedBrandIds");
    expect(home).toContain("const appliedBrandIds = useMemo(");
  });

  it("keeps project type scope wired through applied and draft filters", () => {
    expect(home).toContain("projectTypeScope: appliedProjectTypeScope");
    expect(home).toContain("projectTypeScope: draftProjectTypeScope");
    expect(home).toContain("onProjectTypeScopeChange={setDraftProjectTypeScope}");
    expect(home).toContain("projectTypeScope={filters.projectTypeScope}");
  });
});
