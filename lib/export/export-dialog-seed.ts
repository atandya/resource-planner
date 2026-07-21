/**
 * Memory rule C for the export dialog: dialog-local edits (scope AND date
 * range) survive close/reopen, and are re-seeded from the timeline only when
 * the timeline's contribution has changed by value since it was last applied.
 * "Navigated away and back" compares equal — predictable beats clever.
 */

export interface ExportDialogSeed {
  brandIds: string[];
  startDate?: string;
  endDate?: string;
}

function normalize(seed: ExportDialogSeed): string {
  return JSON.stringify({
    brandIds: seed.brandIds,
    startDate: seed.startDate ?? "",
    endDate: seed.endDate ?? "",
  });
}

export function shouldReseed(input: {
  incomingSeed: ExportDialogSeed;
  lastAppliedSeed: ExportDialogSeed | null;
}): boolean {
  if (!input.lastAppliedSeed) return true;
  return normalize(input.incomingSeed) !== normalize(input.lastAppliedSeed);
}
