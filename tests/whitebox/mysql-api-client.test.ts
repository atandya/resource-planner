import { afterEach, describe, expect, it, vi } from "vitest";
import { createMySqlApiClient } from "@/lib/mysql/api-client";

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
});
