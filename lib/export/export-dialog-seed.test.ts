import { describe, expect, it } from "vitest";
import { shouldReseed, type ExportDialogSeed } from "./export-dialog-seed";

const SEED: ExportDialogSeed = {
  brandIds: ["b1", "b2"],
  startDate: "2026-07-01",
  endDate: "2026-09-30",
};

describe("shouldReseed", () => {
  it("always reseeds when nothing was ever applied", () => {
    expect(shouldReseed({ incomingSeed: SEED, lastAppliedSeed: null })).toBe(true);
  });

  it("does not reseed when the timeline context is unchanged", () => {
    expect(shouldReseed({ incomingSeed: { ...SEED, brandIds: ["b1", "b2"] }, lastAppliedSeed: SEED })).toBe(false);
  });

  it("reseeds when the brand selection changed", () => {
    expect(shouldReseed({ incomingSeed: { ...SEED, brandIds: ["b3"] }, lastAppliedSeed: SEED })).toBe(true);
    expect(shouldReseed({ incomingSeed: { ...SEED, brandIds: [] }, lastAppliedSeed: SEED })).toBe(true);
  });

  it("reseeds when the date range changed", () => {
    expect(shouldReseed({ incomingSeed: { ...SEED, endDate: "2026-12-31" }, lastAppliedSeed: SEED })).toBe(true);
  });

  it("treats absent and undefined dates alike", () => {
    const bare: ExportDialogSeed = { brandIds: [] };
    expect(shouldReseed({ incomingSeed: { brandIds: [], startDate: undefined }, lastAppliedSeed: bare })).toBe(false);
  });

  // Order-sensitive by design: both sides come from the same source
  // (appliedBrandIds in HomeClient), so order differs only if the selection
  // actually changed. Documented here so nobody "fixes" it into a Set compare.
  it("compares brand order as given", () => {
    expect(shouldReseed({ incomingSeed: { ...SEED, brandIds: ["b2", "b1"] }, lastAppliedSeed: SEED })).toBe(true);
  });
});
