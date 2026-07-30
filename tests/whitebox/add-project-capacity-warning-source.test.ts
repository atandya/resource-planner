import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("components/timeline-v2/AddProjectDialog.tsx", "utf8");

describe("AddProjectDialog — over-capacity warning", () => {
  it("delegates the over-capacity check to the pure capacity-warning module", () => {
    expect(source).toContain('from "@/lib/assignments/capacity-warning"');
    expect(source).toContain("getOverCapacityMonths");
    expect(source).toContain("sumExistingMonthlyHours");
  });

  it("fetches the employee's unwindowed assignments so off-screen months are seen", () => {
    expect(source).toContain("useAssignmentsByEmployee");
  });

  it("shows an inline warning naming the offending month(s)", () => {
    expect(source).toContain("add-project-capacity-warning-text");
    expect(source).toContain("overCapacityMonths.length > 0");
  });

  it("confirms before saving when over capacity, but does not block the save outright", () => {
    expect(source).toContain("add-project-capacity-warning");
    expect(source).toContain("add-project-capacity-confirm");
    expect(source).toContain("setCapacityConfirmOpen(true)");
    expect(source).toContain("Assign anyway");
    // canSave must not itself depend on capacity — over-capacity is a warning, not a hard block.
    const canSaveBlock = source.slice(source.indexOf("const canSave ="), source.indexOf("const performAssign"));
    expect(canSaveBlock).not.toContain("overCapacityMonths");
  });

  it("resets the confirmation state when the assign form resets", () => {
    const resetFormBlock = source.slice(source.indexOf("const resetForm = () => {"), source.indexOf("const evenMonthlyStrings"));
    expect(resetFormBlock).toContain("setCapacityConfirmOpen(false)");
  });
});
