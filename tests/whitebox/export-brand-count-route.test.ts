import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/export/brand/excel/route.ts", "utf8");

describe("brand export route — countOnly pre-flight", () => {
  it("returns a JSON count for countOnly requests", () => {
    expect(route).toContain("countOnly");
    expect(route).toContain("count: rows.length");
  });

  it("answers countOnly before the empty-result 404 and before Excel rendering", () => {
    // Anchor on the `if` statement itself, not the preceding comment — a
    // comment left behind after the code moves would otherwise let this
    // assertion pass while the branch order regressed.
    const countIdx = route.indexOf("searchParams.get('countOnly')");
    const notFoundIdx = route.indexOf("status: 404");
    const excelCallIdx = route.indexOf("exportBrandReportToExcel(rows)");
    expect(countIdx).toBeGreaterThan(-1);
    expect(notFoundIdx).toBeGreaterThan(-1);
    expect(excelCallIdx).toBeGreaterThan(-1);
    // Zero rows must yield { count: 0 } with 200, not the export path's 404,
    // and count mode must never pay for xlsx rendering.
    expect(countIdx).toBeLessThan(notFoundIdx);
    expect(countIdx).toBeLessThan(excelCallIdx);
  });
});
