import { createMySqlApiClient } from "@/lib/mysql/api-client";
import type { MySqlBrand, MySqlCampaign, MySqlPitch } from "@/lib/types/mysql";

// The client class is not exported; derive its type from the factory instead.
type MySqlApiClient = ReturnType<typeof createMySqlApiClient>;

/**
 * Restricted, read-only TimeTrack source that authenticates with a service
 * token (NOT a user session). Server-only: used by the webhook handler to
 * fetch the current state of a single entity before mirroring it into the
 * planner directory.
 *
 * The token is never logged.
 */
export function createTimetrackServiceSource(options: {
  token: string;
  client?: Pick<MySqlApiClient, "getBrand" | "getCampaign" | "getPitch">;
}) {
  const client = options.client ?? createMySqlApiClient(async () => options.token);

  return {
    async fetchBrandByUuid(uuid: string): Promise<MySqlBrand | null> {
      const response = await client.getBrand(uuid);
      if (response.status === 404) return null;
      if (!response.success || response.error || !response.data) {
        throw new Error(`TimeTrack brand fetch failed with HTTP ${response.status}`);
      }
      return response.data as MySqlBrand;
    },
    async fetchPitchByUuid(uuid: string): Promise<MySqlPitch | null> {
      const response = await client.getPitch(uuid);
      if (response.status === 404) return null;
      if (!response.success || response.error || !response.data) {
        throw new Error(`TimeTrack pitch fetch failed with HTTP ${response.status}`);
      }
      return response.data as MySqlPitch;
    },
    async fetchCampaignByUuid(uuid: string): Promise<MySqlCampaign | null> {
      const response = await client.getCampaign(uuid);
      if (response.status === 404) return null;
      if (!response.success || response.error || !response.data) {
        throw new Error(`TimeTrack campaign fetch failed with HTTP ${response.status}`);
      }
      return response.data as MySqlCampaign;
    },
  };
}

export type TimetrackServiceSource = ReturnType<typeof createTimetrackServiceSource>;
