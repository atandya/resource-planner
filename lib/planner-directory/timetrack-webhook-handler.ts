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

// Prefer explicit is_active; else fall back to today's TimeTrack shape.
function isBrandActive(b: MySqlBrand): boolean {
  if (typeof b.is_active === "boolean") return b.is_active;
  return b.flag !== "inactive";
}

function isCampaignActive(c: MySqlCampaign): boolean {
  if (typeof c.is_active === "boolean") return c.is_active;
  return c.flag !== "inactive" && c.state !== "archive";
}

function isPitchActive(p: MySqlPitch): boolean {
  if (typeof p.is_active === "boolean") return p.is_active;
  // pitch win/loss are outcomes, not archival; only an explicit is_active===false archives
  return true;
}

function referencedBrandUuid(project: MySqlPitch | MySqlCampaign): string | null {
  return project.brand_uuid ?? project.brand?.uuid ?? null;
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
    if (!brand || !isBrandActive(brand)) {
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
  const active =
    entityType === "pitch"
      ? project
        ? isPitchActive(project as MySqlPitch)
        : false
      : project
        ? isCampaignActive(project as MySqlCampaign)
        : false;
  if (!project || !active) {
    await dependencies.repository.archiveProjectBySource(entityType, event.entityUuid, archivedAt);
    return;
  }

  // Synchronize the referenced brand BEFORE the project row.
  const brandUuid = referencedBrandUuid(project);
  if (brandUuid) await upsertReferencedBrand(brandUuid, dependencies);

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
  if (!brand || !isBrandActive(brand)) return;
  const normalized = normalizeBrandSource(brand);
  if (normalized) await dependencies.repository.upsertBrands([normalized]);
}
