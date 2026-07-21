/**
 * Trigger-button summary for an export scope selection.
 *
 * Follows the product's existing caption rule (see HomeClient's projectCaption):
 * name up to two selections, count beyond that. Empty is labeled explicitly
 * because for exports an empty filter means "everything" — a blank trigger
 * would read as "nothing".
 */

export function formatScopeSummary(input: {
  names: string[];
  allLabel: string;
  countNoun: string;
}): string {
  const names = input.names.filter(Boolean);
  if (names.length === 0) return input.allLabel;
  if (names.length <= 2) return names.join(", ");
  return `${names.length} ${input.countNoun}`;
}
