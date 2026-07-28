import { afterEach, describe, expect, it, vi } from "vitest";
import { createMySqlApiClient } from "@/lib/mysql/api-client";
import { createTimeTrackRequestPacer } from "@/lib/planner-directory/timetrack-request-pacer";

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

function expectSentinelsToBeAbsent(
  result: { message: string; error?: { message: string; originalError?: unknown } },
  logCalls: unknown[][],
  sentinels: string[],
) {
  const originalError = result.error?.originalError;
  expect(originalError).toBeInstanceOf(Error);
  const serializedResult = JSON.stringify(result);
  const serializedLogs = JSON.stringify(logCalls);

  for (const sentinel of sentinels) {
    expect(serializedResult).not.toContain(sentinel);
    expect(serializedLogs).not.toContain(sentinel);
    expect(result.message).not.toContain(sentinel);
    expect(result.error?.message).not.toContain(sentinel);
    expect((originalError as Error).message).not.toContain(sentinel);
    expect((originalError as Error).stack).not.toContain(sentinel);
  }
}

describe("MySqlApiClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
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
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a rate-limited request after deferring for the Retry-After seconds", async () => {
    const deferFor = vi.fn();
    const execute = vi.fn(async (operation) => operation({ deferFor }));
    const delay = vi.fn(async () => undefined);
    stubRateLimitedThenSuccessfulFetch("2");
    const client = createMySqlApiClient(async () => "test-user-token", {
      requestPacer: { execute },
      delay,
    });

    const result = await client.getBrands();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual(successfulResponse);
    expect(deferFor).toHaveBeenCalledWith(2_000);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(delay).not.toHaveBeenCalled();
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

  it("uses the jittered backoff slot when Retry-After is a past HTTP-date", async () => {
    const deferFor = vi.fn();
    const execute = vi.fn(async (operation) => operation({ deferFor }));
    stubRateLimitedThenSuccessfulFetch("Thu, 01 Jan 1970 00:00:05 GMT");
    const client = createMySqlApiClient(async () => "test-user-token", {
      requestPacer: { execute },
      now: () => 10_000,
      random: () => 0.5,
    });

    await client.getBrands();

    expect(deferFor).toHaveBeenCalledWith(500);
  });

  it("locally delays an unpaced rate-limited request before retrying", async () => {
    const delay = vi.fn(async () => undefined);
    stubRateLimitedThenSuccessfulFetch();
    const client = createMySqlApiClient(async () => "test-user-token", {
      delay,
      random: () => 0.5,
    });

    const result = await client.getBrands();

    expect(result).toEqual(successfulResponse);
    expect(delay).toHaveBeenCalledWith(500);
  });

  it("waits for the pacer cooldown before starting the second raw attempt", async () => {
    let now = 0;
    const events: string[] = [];
    const pacer = createTimeTrackRequestPacer({
      minimumIntervalMs: 0,
      now: () => now,
      sleep: async (ms) => {
        events.push(`sleep:${ms}`);
        now += ms;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockImplementationOnce(async () => {
          events.push("fetch:1");
          return new Response(null, { status: 429, headers: { "Retry-After": "2" } });
        })
        .mockImplementationOnce(async () => {
          events.push("fetch:2");
          return new Response(JSON.stringify(successfulResponse), {
            headers: { "Content-Type": "application/json" },
          });
        })
    );
    const client = createMySqlApiClient(async () => "test-user-token", { requestPacer: pacer });

    await client.getBrands();

    expect(events).toEqual(["fetch:1", "sleep:2000", "fetch:2"]);
  });

  it("starts a timeout only after the pacer admits the raw attempt", async () => {
    vi.useFakeTimers();
    const deferFor = vi.fn();
    let runQueuedOperation: (() => Promise<void>) | undefined;
    const execute = vi.fn((operation) => new Promise((resolve, reject) => {
      runQueuedOperation = async () => {
        try {
          resolve(await operation({ deferFor }));
        } catch (error) {
          reject(error);
        }
      };
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(successfulResponse), {
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    const client = createMySqlApiClient(async () => "test-user-token", { requestPacer: { execute } });

    const request = client.getBrands();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    if (!runQueuedOperation) throw new Error("Pacer did not queue an operation");
    await runQueuedOperation();
    await expect(request).resolves.toEqual(successfulResponse);
  });

  it("retries a body request through the same paced 429 behavior", async () => {
    const deferFor = vi.fn();
    const execute = vi.fn(async (operation) => operation({ deferFor }));
    const delay = vi.fn(async () => undefined);
    stubRateLimitedThenSuccessfulFetch("2");
    const client = createMySqlApiClient(async () => "test-user-token", {
      requestPacer: { execute },
      delay,
    });

    const result = await client.createAssignment({
      employee_uuid: "employee-uuid",
      project_uuid: "project-uuid",
      start_date: "2026-07-28",
      end_date: "2026-07-28",
      hours_per_day: "8",
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(deferFor).toHaveBeenCalledWith(2_000);
    expect(delay).not.toHaveBeenCalled();
    expect(result).toEqual(successfulResponse);
  });

  it("does not expose GET tokens, query values, or malformed response text", async () => {
    const token = "GET-TOKEN-SENTINEL";
    const query = "GET-REQUEST-SENTINEL";
    const responseText = "GET-RESPONSE-SENTINEL";
    vi.stubEnv("NODE_ENV", "development");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(responseText, {
        headers: { "Content-Type": "application/json" },
      }))
    );
    const client = createMySqlApiClient(async () => token);

    const result = await client.getBrands({ search: query });

    expectSentinelsToBeAbsent(
      result,
      [...log.mock.calls, ...error.mock.calls],
      [token, query, responseText],
    );
  });

  it("does not expose body tokens, payloads, or malformed response text", async () => {
    const token = "BODY-TOKEN-SENTINEL";
    const requestText = "BODY-REQUEST-SENTINEL";
    const responseText = "BODY-RESPONSE-SENTINEL";
    vi.stubEnv("NODE_ENV", "development");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(responseText, {
        headers: { "Content-Type": "application/json" },
      }))
    );
    const client = createMySqlApiClient(async () => token);

    const result = await client.createAssignment({
      employee_uuid: "employee-uuid",
      project_uuid: "project-uuid",
      start_date: "2026-07-28",
      end_date: "2026-07-28",
      hours_per_day: "8",
      note: requestText,
    });

    expectSentinelsToBeAbsent(
      result,
      [...log.mock.calls, ...error.mock.calls],
      [token, requestText, responseText],
    );
  });
});
