import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchExportCount } from "./fetch-export-count";

const ENDPOINT = "/api/export/brand/excel";
const RANGE = { start: "2026-07-01", end: "2026-07-31" };

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  // stubGlobal rather than a direct `global.fetch =` assignment: only stubs
  // registered this way are tracked, so unstubAllGlobals below actually
  // restores the real fetch instead of silently doing nothing.
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Minimal stand-in for the parts of Response this helper actually reads. */
function jsonResponse(body: unknown, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

describe("fetchExportCount", () => {
  it("returns zero rows as a real count, not as a failure", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ count: 0 }));
    const signal = new AbortController().signal;

    await expect(fetchExportCount(ENDPOINT, { dateRange: RANGE }, signal)).resolves.toBe(0);
  });

  it("returns the row count on success", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ count: 7 }));
    const signal = new AbortController().signal;

    await expect(fetchExportCount(ENDPOINT, { dateRange: RANGE }, signal)).resolves.toBe(7);
  });

  it("throws on a non-200 so a failed request is never read as zero rows", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "boom" }, { ok: false, status: 500 }));
    const signal = new AbortController().signal;

    await expect(fetchExportCount(ENDPOINT, { dateRange: RANGE }, signal)).rejects.toThrow("500");
  });

  it("returns null for a malformed body rather than coercing it", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ count: "5" }));
    const signal = new AbortController().signal;

    await expect(fetchExportCount(ENDPOINT, { dateRange: RANGE }, signal)).resolves.toBeNull();
  });

  it("requests the countOnly pre-flight with the same params as the export", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ count: 3 }));
    const controller = new AbortController();

    await fetchExportCount(
      ENDPOINT,
      { dateRange: RANGE, filters: { brandId: "brand-1", employeeIds: ["e1", "e2"] } },
      controller.signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(ENDPOINT);
    expect(url).toContain("countOnly=true");
    expect(url).toContain("startDate=2026-07-01");
    expect(url).toContain("endDate=2026-07-31");
    expect(url).toContain("brandIds=brand-1");
    expect(url).toContain("employeeIds=e1%2Ce2");
    expect(init.signal).toBe(controller.signal);
  });

  it("lets an aborted signal cancel the request instead of resolving a count", async () => {
    // The mock honours the signal, so abort() is what causes the rejection:
    // drop the abort() line and this fetch resolves with a count and fails.
    fetchMock.mockImplementation(async (_url: string, init: { signal: AbortSignal }) => {
      if (init.signal.aborted) {
        throw Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
      }
      return jsonResponse({ count: 3 });
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      fetchExportCount(ENDPOINT, { dateRange: RANGE }, controller.signal),
    ).rejects.toThrow("aborted");
  });

  it("resolves normally when the same signal is left unaborted", async () => {
    // Positive control for the test above: same signal-honouring mock, no abort.
    fetchMock.mockImplementation(async (_url: string, init: { signal: AbortSignal }) => {
      if (init.signal.aborted) {
        throw Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
      }
      return jsonResponse({ count: 3 });
    });
    const controller = new AbortController();

    await expect(
      fetchExportCount(ENDPOINT, { dateRange: RANGE }, controller.signal),
    ).resolves.toBe(3);
  });
});
