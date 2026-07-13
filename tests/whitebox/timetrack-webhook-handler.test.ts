import { beforeEach, describe, expect, it, vi } from "vitest";
import { processTimetrackPlannerWebhook } from "@/lib/planner-directory/timetrack-webhook-handler";
import type { TimetrackPlannerWebhookEvent } from "@/lib/planner-directory/timetrack-webhook";
import type { MySqlBrand, MySqlCampaign, MySqlPitch } from "@/lib/types/mysql";

const now = () => "2026-07-13T10:00:00.000Z";

function makeBrand(overrides: Partial<MySqlBrand> = {}): MySqlBrand {
  return {
    brand_id: 9,
    uuid: "brand-9-uuid",
    brand_name: "Acme Brand",
    company_name: "Acme Inc",
    flag: "active",
    updated_at: "2026-07-12T00:00:00.000Z",
    ...overrides,
  } as MySqlBrand;
}

function makePitch(overrides: Partial<MySqlPitch> = {}): MySqlPitch {
  return {
    uuid: "pitch-1-uuid",
    pitch_name: "New Pitch",
    brand_id: 9,
    brand_uuid: "brand-9-uuid",
    status: "on_going",
    updated_at: "2026-07-12T00:00:00.000Z",
    ...overrides,
  } as MySqlPitch;
}

function makeCampaign(overrides: Partial<MySqlCampaign> = {}): MySqlCampaign {
  return {
    uuid: "campaign-1-uuid",
    campaign_name: "Summer Campaign",
    brand_id: 9,
    brand_uuid: "brand-9-uuid",
    flag: "active",
    state: "publish",
    start_date: "2026-07-01",
    end_date: "2026-08-01",
    updated_at: "2026-07-12T00:00:00.000Z",
    ...overrides,
  } as MySqlCampaign;
}

const pitchUpsertEvent: TimetrackPlannerWebhookEvent = {
  schemaVersion: 1,
  eventId: "event-1",
  eventType: "planner_entity.upserted",
  entityType: "pitch",
  entityUuid: "pitch-1-uuid",
  occurredAt: "2026-07-13T09:59:00.000Z",
};

const campaignUpsertEvent: TimetrackPlannerWebhookEvent = {
  schemaVersion: 1,
  eventId: "event-2",
  eventType: "planner_entity.upserted",
  entityType: "campaign",
  entityUuid: "campaign-1-uuid",
  occurredAt: "2026-07-13T09:59:00.000Z",
};

const brandUpsertEvent: TimetrackPlannerWebhookEvent = {
  schemaVersion: 1,
  eventId: "event-3",
  eventType: "planner_entity.upserted",
  entityType: "brand",
  entityUuid: "brand-9-uuid",
  occurredAt: "2026-07-13T09:59:00.000Z",
};

const brandDeletedEvent: TimetrackPlannerWebhookEvent = {
  schemaVersion: 1,
  eventId: "event-4",
  eventType: "planner_entity.deleted",
  entityType: "brand",
  entityUuid: "brand-del-uuid",
  occurredAt: "2026-07-13T09:59:00.000Z",
};

const pitchDeletedEvent: TimetrackPlannerWebhookEvent = {
  schemaVersion: 1,
  eventId: "event-5",
  eventType: "planner_entity.deleted",
  entityType: "pitch",
  entityUuid: "pitch-del-uuid",
  occurredAt: "2026-07-13T09:59:00.000Z",
};

function makeDependencies() {
  const source = {
    fetchBrandByUuid: vi.fn(async () => makeBrand()),
    fetchPitchByUuid: vi.fn(async () => makePitch()),
    fetchCampaignByUuid: vi.fn(async () => makeCampaign()),
  };
  const repository = {
    upsertBrands: vi.fn(async () => undefined),
    upsertProjects: vi.fn(async () => undefined),
    archiveBrandBySourceUuid: vi.fn(async () => undefined),
    archiveProjectBySource: vi.fn(async () => undefined),
  };
  return { source, repository, now };
}

describe("processTimetrackPlannerWebhook", () => {
  let deps: ReturnType<typeof makeDependencies>;

  beforeEach(() => {
    deps = makeDependencies();
  });

  it("fetches and upserts an active pitch after first upserting its brand", async () => {
    await processTimetrackPlannerWebhook(pitchUpsertEvent, deps);

    expect(deps.source.fetchPitchByUuid).toHaveBeenCalledWith(pitchUpsertEvent.entityUuid);
    expect(deps.source.fetchBrandByUuid).toHaveBeenCalledWith("brand-9-uuid");
    expect(deps.repository.upsertBrands).toHaveBeenCalledTimes(1);
    expect(deps.repository.upsertProjects).toHaveBeenCalledTimes(1);
    expect(deps.repository.upsertBrands.mock.invocationCallOrder[0]).toBeLessThan(
      deps.repository.upsertProjects.mock.invocationCallOrder[0]
    );
  });

  it("archives a project when an upsert notification fetches a TimeTrack 404", async () => {
    deps.source.fetchPitchByUuid.mockResolvedValue(null as unknown as MySqlPitch);

    await processTimetrackPlannerWebhook(pitchUpsertEvent, deps);

    expect(deps.repository.archiveProjectBySource).toHaveBeenCalledWith(
      "pitch",
      pitchUpsertEvent.entityUuid,
      now()
    );
    expect(deps.repository.upsertProjects).not.toHaveBeenCalled();
  });

  it("archives a deleted brand without fetching TimeTrack", async () => {
    await processTimetrackPlannerWebhook(brandDeletedEvent, deps);

    expect(deps.source.fetchBrandByUuid).not.toHaveBeenCalled();
    expect(deps.repository.archiveBrandBySourceUuid).toHaveBeenCalledWith(
      brandDeletedEvent.entityUuid,
      now()
    );
  });

  it("archives a deleted pitch without fetching TimeTrack", async () => {
    await processTimetrackPlannerWebhook(pitchDeletedEvent, deps);

    expect(deps.source.fetchPitchByUuid).not.toHaveBeenCalled();
    expect(deps.repository.archiveProjectBySource).toHaveBeenCalledWith(
      "pitch",
      pitchDeletedEvent.entityUuid,
      now()
    );
  });

  it("archives an upserted brand whose fetched record is flag:inactive (no is_active)", async () => {
    deps.source.fetchBrandByUuid.mockResolvedValue(makeBrand({ flag: "inactive" }));

    await processTimetrackPlannerWebhook(brandUpsertEvent, deps);

    expect(deps.repository.archiveBrandBySourceUuid).toHaveBeenCalledWith(
      brandUpsertEvent.entityUuid,
      now()
    );
    expect(deps.repository.upsertBrands).not.toHaveBeenCalled();
  });

  it("archives an upserted brand with explicit is_active:false even when flag is active", async () => {
    deps.source.fetchBrandByUuid.mockResolvedValue(
      makeBrand({ is_active: false, flag: "active" })
    );

    await processTimetrackPlannerWebhook(brandUpsertEvent, deps);

    expect(deps.repository.archiveBrandBySourceUuid).toHaveBeenCalledWith(
      brandUpsertEvent.entityUuid,
      now()
    );
    expect(deps.repository.upsertBrands).not.toHaveBeenCalled();
  });

  it("archives an upserted campaign whose state is archive", async () => {
    deps.source.fetchCampaignByUuid.mockResolvedValue(makeCampaign({ state: "archive" }));

    await processTimetrackPlannerWebhook(campaignUpsertEvent, deps);

    expect(deps.repository.archiveProjectBySource).toHaveBeenCalledWith(
      "campaign",
      campaignUpsertEvent.entityUuid,
      now()
    );
    expect(deps.repository.upsertProjects).not.toHaveBeenCalled();
  });

  it("upserts an active campaign after first upserting its referenced brand", async () => {
    await processTimetrackPlannerWebhook(campaignUpsertEvent, deps);

    expect(deps.source.fetchCampaignByUuid).toHaveBeenCalledWith(campaignUpsertEvent.entityUuid);
    expect(deps.source.fetchBrandByUuid).toHaveBeenCalledWith("brand-9-uuid");
    expect(deps.repository.upsertBrands.mock.invocationCallOrder[0]).toBeLessThan(
      deps.repository.upsertProjects.mock.invocationCallOrder[0]
    );
  });

  it("upserts a brand directly for an active brand upsert event", async () => {
    await processTimetrackPlannerWebhook(brandUpsertEvent, deps);

    expect(deps.source.fetchBrandByUuid).toHaveBeenCalledWith(brandUpsertEvent.entityUuid);
    expect(deps.repository.upsertBrands).toHaveBeenCalledTimes(1);
    expect(deps.repository.archiveBrandBySourceUuid).not.toHaveBeenCalled();
  });

  it("does not archive the referenced brand as a side-effect when the project brand is inactive", async () => {
    deps.source.fetchBrandByUuid.mockResolvedValue(makeBrand({ flag: "inactive" }));

    await processTimetrackPlannerWebhook(pitchUpsertEvent, deps);

    // The project still upserts; the brand is simply skipped (not archived).
    expect(deps.repository.archiveBrandBySourceUuid).not.toHaveBeenCalled();
    expect(deps.repository.upsertBrands).not.toHaveBeenCalled();
    expect(deps.repository.upsertProjects).toHaveBeenCalledTimes(1);
  });
});
