import { describe, expect, it, vi } from "vitest";
import { createTimetrackServiceSource } from "@/lib/planner-directory/timetrack-service-source";

const baseUrl = "http://127.0.0.1:8000/api/v1";
const token = "rp-read-test-token";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createTimetrackServiceSource", () => {
  it("fetches a brand through the restricted read endpoint with the RP token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ data: { uuid: "brand-uuid", brand_id: 9, brand_name: "Acme", flag: "active" } })
    );
    const source = createTimetrackServiceSource({ token, baseUrl, fetchImpl });

    await expect(source.fetchBrandByUuid("brand-uuid")).resolves.toMatchObject({ uuid: "brand-uuid" });
    expect(fetchImpl).toHaveBeenCalledWith(
      `${baseUrl}/resource-planner/brands/brand-uuid`,
      expect.objectContaining({ headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } })
    );
  });

  it("returns null for a TimeTrack 404", async () => {
    const source = createTimetrackServiceSource({
      token,
      baseUrl,
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse({ message: "Not found" }, 404)),
    });

    await expect(source.fetchPitchByUuid("missing-pitch")).resolves.toBeNull();
  });

  it("throws a sanitized status error for a non-404 response", async () => {
    const source = createTimetrackServiceSource({
      token,
      baseUrl,
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse({ message: "Unauthorized" }, 401)),
    });

    await expect(source.fetchCampaignByUuid("campaign-uuid")).rejects.toThrow(
      "TimeTrack campaign fetch failed with HTTP 401"
    );
  });
});
