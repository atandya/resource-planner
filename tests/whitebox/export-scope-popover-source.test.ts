import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync("components/export/ExportScopePopover.tsx", "utf8");
const brand = readFileSync("components/export/BrandScopeField.tsx", "utf8");
const department = readFileSync("components/export/DepartmentScopeField.tsx", "utf8");
const dialog = readFileSync("components/export/ExportDialog.tsx", "utf8");
const button = readFileSync("components/export/ExportButton.tsx", "utf8");

describe("export scope popover shell", () => {
  it("centralizes the draft-and-apply popover shared by brand and department fields", () => {
    expect(shell).toContain("export function ExportScopePopover");
    expect(shell).toContain("ExportScopePopoverRenderProps");
    expect(brand).toContain("ExportScopePopover");
    expect(department).toContain("ExportScopePopover");
  });

  it("keeps the export scope footer on semantic tokens and 4/8px spacing", () => {
    expect(shell).toContain("border-t bg-secondary p-2");
    expect(shell).not.toContain("p-2.5");
  });

  it("removes raw green utilities from the changed export controls", () => {
    expect(dialog).not.toContain("text-green-600");
    expect(button).not.toMatch(/bg-green-\d+/);
    expect(button).not.toMatch(/text-green-\d+/);
  });
});
