/**
 * Short-lived memoization for the planner directory's unfiltered full-table reads.
 *
 * `listBrands`/`listProjects`/`listEmployees` are unbounded `SELECT *` scans whose
 * results are identical for every caller. The export route runs all three on each
 * request, including the `countOnly` pre-flight that fires on every debounced date
 * range change in the export dialog, so a single dialog session used to replay the
 * same three full-table scans repeatedly.
 *
 * The TTL is deliberately far shorter than the staleness this product already
 * accepts: `freshness.ts` treats directory data as "healthy" for 15 minutes after a
 * sync. Anything the cache can hide is a fraction of that window.
 *
 * Reads that inform a write must pass `bypassCache` — see the sync engine's
 * incremental diff, which decides what to upsert by comparing stored rows against
 * the source. A stale read there would silently skip real updates.
 */

export const DEFAULT_DIRECTORY_CACHE_TTL_MS = 30_000;

export type DirectoryReadOptions = {
  /** Skip the cache entirely: neither read from it nor write to it. */
  bypassCache?: boolean;
};

type TtlMemoOptions = {
  ttlMs?: number;
  now?: () => number;
};

export type TtlMemo<T> = {
  read: (options?: DirectoryReadOptions) => Promise<T>;
  invalidate: () => void;
};

export function createTtlMemo<T>(load: () => Promise<T>, options: TtlMemoOptions = {}): TtlMemo<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_DIRECTORY_CACHE_TTL_MS;
  const now = options.now ?? Date.now;

  // The promise, not the resolved value, so concurrent callers share one query.
  let entry: { promise: Promise<T>; storedAt: number } | null = null;

  function invalidate(): void {
    entry = null;
  }

  function read(readOptions?: DirectoryReadOptions): Promise<T> {
    if (readOptions?.bypassCache) return load();

    if (entry && now() - entry.storedAt < ttlMs) return entry.promise;

    const promise = load();
    entry = { promise, storedAt: now() };
    promise.catch(() => {
      // Drop a failed load so one blip doesn't poison the rest of the window.
      // Guarded so a later successful entry isn't evicted by an older rejection.
      if (entry?.promise === promise) entry = null;
    });
    return promise;
  }

  return { read, invalidate };
}
