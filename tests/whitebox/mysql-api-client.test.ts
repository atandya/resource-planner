import { afterEach, describe, expect, it, vi } from "vitest";
import { createMySqlApiClient } from "@/lib/mysql/api-client";

const successfulResponse = {
  status: 200,
  success: true,
  message: "OK",
  data: ["brand"],
};

function stubRateLimitedThenSuccessfulFetch(retryAfter?: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 429,
          statusText: "Too Many Requests",
          headers: retryAfter ? { "Retry-After": retryAfter } : undefined,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(successfulResponse), {
          headers: { "Content-Type": "application/json" },
        })
      )
  );
}

describe("MySqlApiClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the stable generic failure status when TimeTrack rejects a user token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401, statusText: "Unauthorized" }))
    );
    const client = createMySqlApiClient(async () => "test-user-token");

    const result = await client.getBrands();

    expect(result.status).toBe(500);
    expect(result.data).toEqual([]);
  });

  it("retries a rate-limited request after deferring for the Retry-After seconds", async () => {
    const deferFor = vi.fn();
    const execute = vi.fn(async (operation) => operation({ deferFor }));
    stubRateLimitedThenSuccessfulFetch("2");
    const client = createMySqlApiClient(async () => "test-user-token", {
      requestPacer: { execute },
    });

    const result = await client.getBrands();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual(successfulResponse);
    expect(deferFor).toHaveBeenCalledWith(2_000);
  });

  it("retries a rate-limited request without Retry-After using the jittered backoff slot", async () => {
    const deferFor = vi.fn();
    const execute = vi.fn(async (operation) => operation({ deferFor }));
    stubRateLimitedThenSuccessfulFetch();
    const client = createMySqlApiClient(async () => "test-user-token", {
      requestPacer: { execute },
      random: () => 0.5,
    });

    const result = await client.getBrands();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual(successfulResponse);
    expect(deferFor).toHaveBeenCalledWith(500);
  });

  it("parses a Retry-After HTTP-date before deferring a rate-limited request", async () => {
    const deferFor = vi.fn();
    const execute = vi.fn(async (operation) => operation({ deferFor }));
    stubRateLimitedThenSuccessfulFetch("Thu, 01 Jan 1970 00:00:15 GMT");
    const client = createMySqlApiClient(async () => "test-user-token", {
      requestPacer: { execute },
      now: () => 10_000,
    });

    await client.getBrands();

    expect(deferFor).toHaveBeenCalledWith(5_000);
  });

  it("uses the jittered backoff slot when Retry-After is invalid", async () => {
    const deferFor = vi.fn();
    const execute = vi.fn(async (operation) => operation({ deferFor }));
    stubRateLimitedThenSuccessfulFetch("not-a-delay");
    const client = createMySqlApiClient(async () => "test-user-token", {
      requestPacer: { execute },
      random: () => 0.5,
    });

    await client.getBrands();

    expect(deferFor).toHaveBeenCalledWith(500);
  });
});
