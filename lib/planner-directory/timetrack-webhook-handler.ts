import type { TimetrackPlannerWebhookEvent } from "@/lib/planner-directory/timetrack-webhook";
import {
  normalizeBrandSource,
  normalizeProjectSource,
} from "@/lib/planner-directory/timetrack-source";
import type {
  PlannerDirectoryBrandRow,
  PlannerDirectoryProjectRow,
  PlannerDirectorySourceType,
} from "@/lib/planner-directory/types";
import type { MySqlBrand, MySqlCampaign, MySqlPitch } from "@/lib/types/mysql";

export type TimetrackWebhookHandlerDependencies = {
  source: {
    fetchBrandByUuid(uuid: string): Promise<MySqlBrand | null>;
    fetchPitchByUuid(uuid: string): Promise<MySqlPitch | null>;
    fetchCampaignByUuid(uuid: string): Promise<MySqlCampaign | null>;
  };
  repository: {
    upsertBrands(rows: PlannerDirectoryBrandRow[]): Promise<unknown>;
    upsertProjects(rows: PlannerDirectoryProjectRow[]): Promise<unknown>;
    archiveBrandBySourceUuid(sourceUuid: string, archivedAt: string): Promise<unknown>;
    archiveProjectBySource(
      sourceType: PlannerDirectorySourceType,
      sourceUuid: string,
      archivedAt: string
    ): Promise<unknown>;
  };
  now: () => string;
};

function requiredIsActive(
  entity: MySqlBrand | MySqlPitch | MySqlCampaign,
  entityName: "brand" | "pitch" | "campaign"
): boolean {
  if (typeof entity.is_active !== "boolean") {
    throw new Error(`TimeTrack ${entityName} response is missing required is_active`);
  }
  return entity.is_active;
}

function requiredBrandUuid(
  project: MySqlPitch | MySqlCampaign,
  entityName: "pitch" | "campaign"
): string {
  if (typeof project.brand_uuid !== "string" || project.brand_uuid.trim().length === 0) {
    throw new Error(`TimeTrack ${entityName} response is missing required brand_uuid`);
  }
  return project.brand_uuid;
}

export async function processTimetrackPlannerWebhook(
  event: TimetrackPlannerWebhookEvent,
  dependencies: TimetrackWebhookHandlerDependencies
): Promise<void> {
  const archivedAt = dependencies.now();

  // Deleted events archive directly WITHOUT any TimeTrack fetch.
  if (event.eventType === "planner_entity.deleted") {
    if (event.entityType === "brand") {
      await dependencies.repository.archiveBrandBySourceUuid(event.entityUuid, archivedAt);
      return;
    }
    await dependencies.repository.archiveProjectBySource(event.entityType, event.entityUuid, archivedAt);
    return;
  }

  if (event.entityType === "brand") {
    const brand = await dependencies.source.fetchBrandByUuid(event.entityUuid);
    if (!brand) {
      await dependencies.repository.archiveBrandBySourceUuid(event.entityUuid, archivedAt);
      return;
    }
    if (!requiredIsActive(brand, "brand")) {
      await dependencies.repository.archiveBrandBySourceUuid(event.entityUuid, archivedAt);
      return;
    }
    const normalized = normalizeBrandSource(brand);
    if (!normalized) throw new Error("TimeTrack brand is missing its source identifier");
    await dependencies.repository.upsertBrands([normalized]);
    return;
  }

  // event.entityType is "pitch" | "campaign" here.
  const entityType = event.entityType;
  const project =
    entityType === "pitch"
      ? await dependencies.source.fetchPitchByUuid(event.entityUuid)
      : await dependencies.source.fetchCampaignByUuid(event.entityUuid);
  if (!project) {
    await dependencies.repository.archiveProjectBySource(entityType, event.entityUuid, archivedAt);
    return;
  }
  if (!requiredIsActive(project, entityType)) {
    await dependencies.repository.archiveProjectBySource(entityType, event.entityUuid, archivedAt);
    return;
  }

  // Synchronize the referenced brand BEFORE the project row.
  const brandUuid = requiredBrandUuid(project, entityType);
  await upsertReferencedBrand(brandUuid, dependencies);

  const normalized = normalizeProjectSource(project, entityType);
  if (!normalized) throw new Error("TimeTrack project is missing its UUID");
  await dependencies.repository.upsertProjects([normalized]);
}

async function upsertReferencedBrand(
  brandUuid: string,
  dependencies: TimetrackWebhookHandlerDependencies
): Promise<void> {
  const brand = await dependencies.source.fetchBrandByUuid(brandUuid);
  // Do not archive the brand as a side-effect of a project event; just skip.
  if (!brand || !requiredIsActive(brand, "brand")) return;
  const normalized = normalizeBrandSource(brand);
  if (normalized) await dependencies.repository.upsertBrands([normalized]);
}
