import { describe, expect, it } from "vitest";
import { formatScopeSummary } from "./export-scope-label";

const input = (names: string[]) => ({ names, allLabel: "All brands", countNoun: "brands" });

describe("formatScopeSummary", () => {
  it("labels an empty selection as the all-inclusive scope", () => {
    expect(formatScopeSummary(input([]))).toBe("All brands");
  });

  it("shows one or two names in full", () => {
    expect(formatScopeSummary(input(["BMW"]))).toBe("BMW");
    expect(formatScopeSummary(input(["BMW", "Disney+ & Disney Studios"]))).toBe(
      "BMW, Disney+ & Disney Studios",
    );
  });

  it("collapses three or more into a count", () => {
    expect(formatScopeSummary(input(["A", "B", "C"]))).toBe("3 brands");
    expect(formatScopeSummary(input(["A", "B", "C", "D", "E"]))).toBe("5 brands");
  });

  it("ignores blank names", () => {
    expect(formatScopeSummary(input(["BMW", ""]))).toBe("BMW");
  });
});
