import { describe, expect, it, vi } from "vitest";
import { createTtlMemo } from "./directory-cache";

function createClock(start = 1_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe("createTtlMemo", () => {
  it("loads once and serves the cached value within the TTL", async () => {
    const clock = createClock();
    const load = vi.fn(async () => ["a"]);
    const memo = createTtlMemo(load, { ttlMs: 1_000, now: clock.now });

    expect(await memo.read()).toEqual(["a"]);
    clock.advance(999);
    expect(await memo.read()).toEqual(["a"]);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads once the entry reaches the TTL", async () => {
    const clock = createClock();
    const load = vi.fn(async () => ["a"]);
    const memo = createTtlMemo(load, { ttlMs: 1_000, now: clock.now });

    await memo.read();
    clock.advance(1_000);
    await memo.read();

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("collapses concurrent callers into a single load", async () => {
    const clock = createClock();
    const load = vi.fn(
      () => new Promise<string[]>((resolve) => setTimeout(() => resolve(["a"]), 10)),
    );
    const memo = createTtlMemo(load, { ttlMs: 1_000, now: clock.now });

    // A burst of debounced count pre-flights must not each open a query.
    const results = await Promise.all([memo.read(), memo.read(), memo.read()]);

    expect(results).toEqual([["a"], ["a"], ["a"]]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed load", async () => {
    const clock = createClock();
    const load = vi
      .fn<() => Promise<string[]>>()
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValue(["a"]);
    const memo = createTtlMemo(load, { ttlMs: 1_000, now: clock.now });

    await expect(memo.read()).rejects.toThrow("connection lost");
    // One blip must not poison the whole TTL window.
    expect(await memo.read()).toEqual(["a"]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("caches an empty result like any other value", async () => {
    const clock = createClock();
    const load = vi.fn(async () => [] as string[]);
    const memo = createTtlMemo(load, { ttlMs: 1_000, now: clock.now });

    expect(await memo.read()).toEqual([]);
    expect(await memo.read()).toEqual([]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("invalidate forces the next read to reload", async () => {
    const clock = createClock();
    const load = vi.fn(async () => ["a"]);
    const memo = createTtlMemo(load, { ttlMs: 1_000, now: clock.now });

    await memo.read();
    memo.invalidate();
    await memo.read();

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("bypass reads fresh without consulting the cache", async () => {
    const clock = createClock();
    const load = vi.fn(async () => ["a"]);
    const memo = createTtlMemo(load, { ttlMs: 1_000, now: clock.now });

    await memo.read();
    await memo.read({ bypassCache: true });

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not republish an in-flight snapshot that invalidate superseded", async () => {
    const clock = createClock();
    const deferred: Array<(rows: string[]) => void> = [];
    const load = vi.fn(() => new Promise<string[]>((resolve) => deferred.push(resolve)));
    const memo = createTtlMemo(load, { ttlMs: 1_000, now: clock.now });

    // Read starts before a write, invalidate lands mid-flight, read resolves after.
    const inFlight = memo.read();
    memo.invalidate();
    const afterWrite = memo.read();
    deferred[0]?.(["pre-write"]);
    deferred[1]?.(["post-write"]);

    expect(await inFlight).toEqual(["pre-write"]);
    // The caller that arrived after the write must not get the pre-write snapshot.
    expect(await afterWrite).toEqual(["post-write"]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("a late rejection does not evict a newer successful entry", async () => {
    const clock = createClock();
    const rejecters: Array<(error: Error) => void> = [];
    const resolvers: Array<(rows: string[]) => void> = [];
    const load = vi.fn(
      () => new Promise<string[]>((resolve, reject) => {
        resolvers.push(resolve);
        rejecters.push(reject);
      }),
    );
    const memo = createTtlMemo(load, { ttlMs: 1_000, now: clock.now });

    const doomed = memo.read();
    memo.invalidate();
    const replacement = memo.read();
    resolvers[1]?.(["fresh"]);
    await replacement;
    // The stale read fails only after the replacement entry is already cached.
    rejecters[0]?.(new Error("connection lost"));
    await expect(doomed).rejects.toThrow("connection lost");

    expect(await memo.read()).toEqual(["fresh"]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("bypass does not populate the cache", async () => {
    const clock = createClock();
    const load = vi.fn(async () => ["a"]);
    const memo = createTtlMemo(load, { ttlMs: 1_000, now: clock.now });

    // A sync's pre-write read must not become the snapshot other callers see.
    await memo.read({ bypassCache: true });
    await memo.read();

    expect(load).toHaveBeenCalledTimes(2);
  });
});
