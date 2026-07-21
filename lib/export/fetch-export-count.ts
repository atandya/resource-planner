/**
 * countOnly pre-flight request for the export dialog's live record count.
 *
 * Extracted from the dialog so the request semantics — same params as the
 * real export, non-200 is a failure rather than "zero rows" — are testable
 * without a DOM. The component keeps only the debounce and the setState.
 */

import { buildExportSearchParams, type ExportQueryInput } from "./export-params";

/**
 * Returns the number of rows the export would produce, or null when the
 * response body is not shaped as expected.
 *
 * Throws on a failed request. Zero is a legitimate count and comes back as 0 —
 * the route returns 200 with { count: 0 } for an empty result — so a caller
 * must never treat a thrown error and a 0 as the same thing.
 *
 * `endpoint` comes from countEndpointFor() in export-count-state, which owns
 * the decision of which export types are countable and where their counts live.
 */
export async function fetchExportCount(
  endpoint: string,
  input: ExportQueryInput,
  signal: AbortSignal,
): Promise<number | null> {
  const params = buildExportSearchParams(input);
  params.append("countOnly", "true");

  const response = await fetch(`${endpoint}?${params.toString()}`, { signal });
  // Non-200 means the request failed (401/400/500) — never "zero rows".
  if (!response.ok) throw new Error(`Count request failed: ${response.status}`);

  const data = await response.json();
  return typeof data?.count === "number" ? data.count : null;
}
