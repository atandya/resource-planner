import type { MySqlBrand, MySqlCampaign, MySqlPitch } from "@/lib/types/mysql";

type TimetrackFetch = typeof fetch;
type RestrictedEntity = "brand" | "pitch" | "campaign";

function restrictedBaseUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/resource-planner`;
}

async function fetchRestrictedEntity<T>(args: {
  entity: RestrictedEntity;
  uuid: string;
  token: string;
  baseUrl: string;
  fetchImpl: TimetrackFetch;
}): Promise<T | null> {
  const response = await args.fetchImpl(
    `${restrictedBaseUrl(args.baseUrl)}/${args.entity}s/${encodeURIComponent(args.uuid)}`,
    {
      headers: { Authorization: `Bearer ${args.token}`, Accept: "application/json" },
      cache: "no-store",
    }
  );

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`TimeTrack ${args.entity} fetch failed with HTTP ${response.status}`);

  const body = (await response.json()) as { data?: T };
  if (!body.data) throw new Error(`TimeTrack ${args.entity} fetch returned an invalid response`);
  return body.data;
}

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
  baseUrl?: string;
  fetchImpl?: TimetrackFetch;
}) {
  const baseUrl = options.baseUrl ?? process.env.TIMETRACK_API_URL ?? "http://127.0.0.1:8000/api/v1";
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    fetchBrandByUuid(uuid: string): Promise<MySqlBrand | null> {
      return fetchRestrictedEntity<MySqlBrand>({ entity: "brand", uuid, token: options.token, baseUrl, fetchImpl });
    },
    fetchPitchByUuid(uuid: string): Promise<MySqlPitch | null> {
      return fetchRestrictedEntity<MySqlPitch>({ entity: "pitch", uuid, token: options.token, baseUrl, fetchImpl });
    },
    fetchCampaignByUuid(uuid: string): Promise<MySqlCampaign | null> {
      return fetchRestrictedEntity<MySqlCampaign>({
        entity: "campaign",
        uuid,
        token: options.token,
        baseUrl,
        fetchImpl,
      });
    },
  };
}

export type TimetrackServiceSource = ReturnType<typeof createTimetrackServiceSource>;
