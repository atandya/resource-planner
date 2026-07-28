import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchTimetrackCampaigns,
  fetchTimetrackDepartments,
} from "@/lib/planner-directory/timetrack-source";

const mocks = vi.hoisted(() => ({
  getDepartments: vi.fn(),
  getCampaigns: vi.fn(),
  createMySqlApiClient: vi.fn(),
  pacers: [] as unknown[],
}));

vi.mock("@/lib/mysql/api-client", () => ({
  createMySqlApiClient: mocks.createMySqlApiClient,
}));

describe("planner directory timetrack source", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pacers.splice(0);
    mocks.createMySqlApiClient.mockImplementation((_getToken, options) => {
      mocks.pacers.push(options?.requestPacer);
      return {
        getDepartments: mocks.getDepartments,
        getCampaigns: mocks.getCampaigns,
      };
    });
  });

  it("reads nested Timetrack list payloads into page records", async () => {
    mocks.getDepartments.mockResolvedValue({
      status: 200,
      data: {
        data: [
          {
            id: 1,
            department_name: "Creative",
            code: "CR",
            color: "#111111",
            is_active: true,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-06-05T00:00:00Z",
            flag: "active",
          },
        ],
        meta: {
          current_page: 1,
          per_page: 100,
          total: 1,
          last_page: 1,
        },
      },
      meta: {
        current_page: 1,
        per_page: 100,
        total: 1,
        last_page: 1,
      },
    });

    const result = await fetchTimetrackDepartments({
      access_token: "token",
    } as never);

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.department_name).toBe("Creative");
  });

  it("throws when the departments API reports a failure instead of returning empty data", async () => {
    mocks.getDepartments.mockResolvedValue({
      status: 403,
      success: false,
      message: "Forbidden",
      data: [],
      error: {
        message: "Forbidden",
        type: "auth",
      },
    });

    await expect(
      fetchTimetrackDepartments({
        access_token: "token",
      } as never)
    ).rejects.toThrow("TimeTrack departments fetch failed on page 1: Forbidden");
  });

  it("shares one request pacer across directory list clients", async () => {
    mocks.getDepartments.mockResolvedValue({
      status: 200,
      data: [],
      meta: { current_page: 1, last_page: 1 },
    });
    mocks.getCampaigns.mockResolvedValue({
      status: 200,
      data: [],
      meta: { current_page: 1, last_page: 1 },
    });

    const session = { access_token: "token" } as never;

    await fetchTimetrackDepartments(session);
    await fetchTimetrackCampaigns(session);

    expect(mocks.pacers).toHaveLength(2);
    expect(mocks.pacers[0]).toBe(mocks.pacers[1]);
    expect(mocks.pacers[0]).toBeDefined();
  });
});
