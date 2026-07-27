import type { SessionData } from "@/lib/auth/session";
import type { MySqlBrand, MySqlCampaign, MySqlEmployee, MySqlPitch } from "@/lib/types/mysql";
import {
  fetchTimetrackBrandById,
  fetchTimetrackBrands,
  fetchTimetrackCampaignByUuid,
  fetchTimetrackCampaigns,
  fetchTimetrackDepartmentById,
  fetchTimetrackDepartments,
  fetchTimetrackEmployeeByUuid,
  fetchTimetrackEmployees,
  fetchTimetrackPitchByUuid,
  fetchTimetrackPitches,
  normalizeBrandSource,
  normalizeDepartmentSource,
  normalizeEmployeeSource,
  normalizeProjectSource,
} from "@/lib/planner-directory/timetrack-source";
import {
  buildPlannerProjectKey,
  type PlannerDirectoryBrandRow,
  type PlannerDirectoryDepartmentRow,
  type PlannerDirectoryEmployeeRow,
  type PlannerDirectoryProjectRow,
  type PlannerDirectorySyncRun,
  type PlannerDirectorySourceType,
  type PlannerSyncMode,
} from "@/lib/planner-directory/types";
import { plannerDirectoryRepository, createPlannerDirectoryRepository } from "@/lib/planner-directory/repository";

type PlannerDirectorySource = {
  fetchDepartments(session: SessionData): Promise<{ records: Array<Record<string, unknown>> }>;
  fetchBrands(session: SessionData): Promise<{ records: MySqlBrand[] }>;
  fetchCampaigns(session: SessionData): Promise<{ records: MySqlCampaign[] }>;
  fetchPitches(session: SessionData): Promise<{ records: MySqlPitch[] }>;
  fetchEmployees(session: SessionData): Promise<{ records: MySqlEmployee[] }>;
  fetchDepartmentById(session: SessionData, sourceDepartmentId: string): Promise<Record<string, unknown> | null>;
  fetchBrandById(session: SessionData, sourceBrandId: string): Promise<MySqlBrand | null>;
  fetchCampaignByUuid(session: SessionData, sourceProjectId: string): Promise<MySqlCampaign | null>;
  fetchPitchByUuid(session: SessionData, sourceProjectId: string): Promise<MySqlPitch | null>;
  fetchEmployeeByUuid(session: SessionData, sourceEmployeeUuid: string): Promise<MySqlEmployee | null>;
};

type PlannerDirectoryRepository = ReturnType<typeof createPlannerDirectoryRepository>;

type SyncEngineDependencies = {
  repository?: PlannerDirectoryRepository;
  source?: PlannerDirectorySource;
  now?: () => string;
};

type SyncInput = {
  session: SessionData;
  syncMode: PlannerSyncMode;
  triggerSource: string;
  triggeredBy?: string | null;
  scope?: {
    entityType?: "department" | "brand" | "project" | "employee";
    sourceId?: string;
    projectKey?: string;
  };
};

type NormalizedBatchResult<T> = {
  rows: T[];
  issues: Array<{
    entityType: string;
    sourceId: string | null;
    severity: "info" | "warning" | "error";
    message: string;
    payload: Record<string, unknown> | null;
  }>;
};

type SyncSummary = PlannerDirectorySyncRun & {
  issues: number;
};

const defaultSource: PlannerDirectorySource = {
  fetchDepartments: (session) => fetchTimetrackDepartments(session),
  fetchBrands: (session) => fetchTimetrackBrands(session),
  fetchCampaigns: (session) => fetchTimetrackCampaigns(session),
  fetchPitches: (session) => fetchTimetrackPitches(session),
  fetchEmployees: (session) => fetchTimetrackEmployees(session),
  fetchDepartmentById: (session, sourceDepartmentId) =>
    fetchTimetrackDepartmentById(session, sourceDepartmentId),
  fetchBrandById: (session, sourceBrandId) => fetchTimetrackBrandById(session, sourceBrandId),
  fetchCampaignByUuid: (session, sourceProjectId) => fetchTimetrackCampaignByUuid(session, sourceProjectId),
  fetchPitchByUuid: (session, sourceProjectId) => fetchTimetrackPitchByUuid(session, sourceProjectId),
  fetchEmployeeByUuid: (session, sourceEmployeeUuid) => fetchTimetrackEmployeeByUuid(session, sourceEmployeeUuid),
};

function nowIso(now?: () => string): string {
  return now ? now() : new Date().toISOString();
}

function parseProjectKey(projectKey: string): { sourceType: PlannerDirectorySourceType; sourceProjectId: string } | null {
  const [sourceType, ...rest] = projectKey.split(":");
  if (sourceType !== "campaign" && sourceType !== "pitch") {
    return null;
  }
  const sourceProjectId = rest.join(":");
  return sourceProjectId ? { sourceType, sourceProjectId } : null;
}

function filterChangedDepartments(
  existing: PlannerDirectoryDepartmentRow[],
  incoming: PlannerDirectoryDepartmentRow[]
): PlannerDirectoryDepartmentRow[] {
  const existingById = new Map(existing.map((row) => [row.departmentId, row]));
  return incoming.filter((row) => existingById.get(row.departmentId)?.sourceHash !== row.sourceHash);
}

function filterChangedBrands(existing: readonly PlannerDirectoryBrandRow[], incoming: PlannerDirectoryBrandRow[]): PlannerDirectoryBrandRow[] {
  const existingById = new Map(existing.map((row) => [row.brandId, row]));
  return incoming.filter((row) => existingById.get(row.brandId)?.sourceHash !== row.sourceHash);
}

function filterChangedProjects(
  existing: readonly PlannerDirectoryProjectRow[],
  incoming: PlannerDirectoryProjectRow[]
): PlannerDirectoryProjectRow[] {
  const existingById = new Map(existing.map((row) => [row.projectKey, row]));
  return incoming.filter((row) => existingById.get(row.projectKey)?.sourceHash !== row.sourceHash);
}

function filterChangedEmployees(
  existing: readonly PlannerDirectoryEmployeeRow[],
  incoming: PlannerDirectoryEmployeeRow[]
): PlannerDirectoryEmployeeRow[] {
  const existingById = new Map(existing.map((row) => [row.employeeUuid, row]));
  return incoming.filter((row) => existingById.get(row.employeeUuid)?.sourceHash !== row.sourceHash);
}

function dedupeByKey<T>(items: T[], getKey: (item: T) => string): { rows: T[]; duplicates: string[] } {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const rows: T[] = [];

  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) {
      duplicates.push(key);
      continue;
    }
    seen.add(key);
    rows.push(item);
  }

  return { rows, duplicates };
}

async function normalizeDepartments(records: Array<Record<string, unknown>>) {
  const rows: PlannerDirectoryDepartmentRow[] = [];
  const issues: NormalizedBatchResult<PlannerDirectoryDepartmentRow>["issues"] = [];

  for (const record of records) {
    const normalized = normalizeDepartmentSource(record as Parameters<typeof normalizeDepartmentSource>[0]);
    if (!normalized) {
      issues.push({
        entityType: "department",
        sourceId: null,
        severity: "warning",
        message: "Department record is missing an identifier",
        payload: record,
      });
      continue;
    }
    rows.push(normalized);
  }

  const deduped = dedupeByKey(rows, (row) => row.departmentId);
  deduped.duplicates.forEach((duplicate) => {
    issues.push({
      entityType: "department",
      sourceId: duplicate,
      severity: "warning",
      message: "Duplicate department record ignored",
      payload: null,
    });
  });

  return { rows: deduped.rows, issues };
}

async function normalizeBrands(records: MySqlBrand[]) {
  const rows: PlannerDirectoryBrandRow[] = [];
  const issues: NormalizedBatchResult<PlannerDirectoryBrandRow>["issues"] = [];

  for (const record of records) {
    const normalized = normalizeBrandSource(record);
    if (!normalized) {
      issues.push({
        entityType: "brand",
        sourceId: null,
        severity: "warning",
        message: "Brand record is missing an identifier",
        payload: record,
      });
      continue;
    }
    rows.push(normalized);
  }

  const deduped = dedupeByKey(rows, (row) => row.brandId);
  deduped.duplicates.forEach((duplicate) => {
    issues.push({
      entityType: "brand",
      sourceId: duplicate,
      severity: "warning",
      message: "Duplicate brand record ignored",
      payload: null,
    });
  });

  return { rows: deduped.rows, issues };
}

async function normalizeProjects(records: Array<MySqlCampaign | MySqlPitch>) {
  const rows: PlannerDirectoryProjectRow[] = [];
  const issues: NormalizedBatchResult<PlannerDirectoryProjectRow>["issues"] = [];

  for (const record of records) {
    const sourceType = "campaign_name" in record ? "campaign" : "pitch";
    const normalized = normalizeProjectSource(record, sourceType);
    if (!normalized) {
      issues.push({
        entityType: "project",
        sourceId: null,
        severity: "warning",
        message: "Project record is missing an identifier",
        payload: record,
      });
      continue;
    }
    rows.push(normalized);
  }

  const deduped = dedupeByKey(rows, (row) => row.projectKey);
  deduped.duplicates.forEach((duplicate) => {
    issues.push({
      entityType: "project",
      sourceId: duplicate,
      severity: "warning",
      message: "Duplicate project record ignored",
      payload: null,
    });
  });

  return { rows: deduped.rows, issues };
}

async function normalizeEmployees(records: MySqlEmployee[]) {
  const rows: PlannerDirectoryEmployeeRow[] = [];
  const issues: NormalizedBatchResult<PlannerDirectoryEmployeeRow>["issues"] = [];

  for (const record of records) {
    const normalized = normalizeEmployeeSource(record);
    if (!normalized) {
      issues.push({
        entityType: "employee",
        sourceId: null,
        severity: "warning",
        message: "Employee record is missing an identifier",
        payload: record,
      });
      continue;
    }
    rows.push(normalized);
  }

  const deduped = dedupeByKey(rows, (row) => row.employeeUuid);
  deduped.duplicates.forEach((duplicate) => {
    issues.push({
      entityType: "employee",
      sourceId: duplicate,
      severity: "warning",
      message: "Duplicate employee record ignored",
      payload: null,
    });
  });

  return { rows: deduped.rows, issues };
}

async function runBackfill(
  session: SessionData,
  repository: PlannerDirectoryRepository,
  source: PlannerDirectorySource,
  now: () => string
): Promise<SyncSummary> {
  console.info("[Planner Directory Sync] Starting full backfill", {
    trigger: "full_backfill",
    source: "timetrack",
  });

  const [departmentSource, brandSource, campaignSource, pitchSource, employeeSource] = await Promise.all([
    source.fetchDepartments(session),
    source.fetchBrands(session),
    source.fetchCampaigns(session),
    source.fetchPitches(session),
    source.fetchEmployees(session),
  ]);

  const departments = await normalizeDepartments(departmentSource.records);
  const brands = await normalizeBrands(brandSource.records);
  const projects = await normalizeProjects([...campaignSource.records, ...pitchSource.records]);
  const employees = await normalizeEmployees(employeeSource.records);

  console.info("[Planner Directory Sync] Full backfill source counts", {
    departments: departmentSource.records.length,
    brands: brandSource.records.length,
    campaigns: campaignSource.records.length,
    pitches: pitchSource.records.length,
    employees: employeeSource.records.length,
    departmentIssues: departments.issues.length,
    brandIssues: brands.issues.length,
    projectIssues: projects.issues.length,
    employeeIssues: employees.issues.length,
  });

  if (
    departmentSource.records.length === 0 &&
    brandSource.records.length === 0 &&
    campaignSource.records.length === 0 &&
    pitchSource.records.length === 0 &&
    employeeSource.records.length === 0
  ) {
    console.warn("[Planner Directory Sync] Full backfill returned zero source rows", {
      accessLevel: session.access?.level ?? null,
      employeeUuid: session.employee?.uuid ?? null,
      triggerSource: "full_backfill",
    });
  }

  const [departmentsUpserted, brandsUpserted, projectsUpserted, employeesUpserted] = await Promise.all([
    repository.upsertDepartments(departments.rows),
    repository.upsertBrands(brands.rows),
    repository.upsertProjects(projects.rows),
    repository.upsertEmployees(employees.rows),
  ]);

  const [departmentsArchived, brandsArchived, projectsArchived, employeesArchived] = await Promise.all([
    repository.markMissingAsArchived({
      entity: "department",
      seenIds: departments.rows.map((row) => row.departmentId),
      archivedAt: now(),
    }),
    repository.markMissingAsArchived({
      entity: "brand",
      seenIds: brands.rows.map((row) => row.brandId),
      archivedAt: now(),
    }),
    repository.markMissingAsArchived({
      entity: "project",
      seenIds: projects.rows.map((row) => row.projectKey),
      archivedAt: now(),
    }),
    repository.markMissingAsArchived({
      entity: "employee",
      seenIds: employees.rows.map((row) => row.employeeUuid),
      archivedAt: now(),
    }),
  ]);

  console.info("[Planner Directory Sync] Full backfill write summary", {
    departmentsUpserted,
    brandsUpserted,
    projectsUpserted,
    employeesUpserted,
    departmentsArchived,
    brandsArchived,
    projectsArchived,
    employeesArchived,
  });

  return {
    syncRunId: "pending",
    syncMode: "full_backfill",
    status: "succeeded",
    startedAt: now(),
    finishedAt: now(),
    triggeredBy: null,
    triggerSource: "manual",
    employeesSeen: employeeSource.records.length,
    employeesUpserted,
    departmentsSeen: departmentSource.records.length,
    departmentsUpserted,
    brandsSeen: brandSource.records.length,
    brandsUpserted,
    projectsSeen: campaignSource.records.length + pitchSource.records.length,
    projectsUpserted,
    recordsArchived: departmentsArchived + brandsArchived + projectsArchived + employeesArchived,
    issueCount:
      departments.issues.length + brands.issues.length + projects.issues.length + employees.issues.length,
    errorMessage: null,
    metadata: {
      source: "timetrack",
      mode: "full_backfill",
    },
  };
}

async function runIncremental(
  session: SessionData,
  repository: PlannerDirectoryRepository,
  source: PlannerDirectorySource,
  now: () => string
): Promise<SyncSummary> {
  // These reads decide what gets upserted below (filterChanged*), so they must see
  // committed rows. A cached snapshot warmed by an earlier request could make a
  // genuinely changed row look unchanged and silently skip its update.
  const [existingDepartments, existingBrands, existingProjects, existingEmployees] = await Promise.all([
    repository.listDepartments(),
    repository.listBrands({ bypassCache: true }),
    repository.listProjects({ bypassCache: true }),
    repository.listEmployees({ bypassCache: true }),
  ]);
  const [departmentSource, brandSource, campaignSource, pitchSource, employeeSource] = await Promise.all([
    source.fetchDepartments(session),
    source.fetchBrands(session),
    source.fetchCampaigns(session),
    source.fetchPitches(session),
    source.fetchEmployees(session),
  ]);

  const departments = await normalizeDepartments(departmentSource.records);
  const brands = await normalizeBrands(brandSource.records);
  const projects = await normalizeProjects([...campaignSource.records, ...pitchSource.records]);
  const employees = await normalizeEmployees(employeeSource.records);

  const changedDepartments = filterChangedDepartments(existingDepartments, departments.rows);
  const changedBrands = filterChangedBrands(existingBrands, brands.rows);
  const changedProjects = filterChangedProjects(existingProjects, projects.rows);
  const changedEmployees = filterChangedEmployees(existingEmployees, employees.rows);

  const [departmentsUpserted, brandsUpserted, projectsUpserted, employeesUpserted] = await Promise.all([
    repository.upsertDepartments(changedDepartments),
    repository.upsertBrands(changedBrands),
    repository.upsertProjects(changedProjects),
    repository.upsertEmployees(changedEmployees),
  ]);

  const [departmentsArchived, brandsArchived, projectsArchived, employeesArchived] = await Promise.all([
    repository.markMissingAsArchived({
      entity: "department",
      seenIds: departments.rows.map((row) => row.departmentId),
      archivedAt: now(),
    }),
    repository.markMissingAsArchived({
      entity: "brand",
      seenIds: brands.rows.map((row) => row.brandId),
      archivedAt: now(),
    }),
    repository.markMissingAsArchived({
      entity: "project",
      seenIds: projects.rows.map((row) => row.projectKey),
      archivedAt: now(),
    }),
    repository.markMissingAsArchived({
      entity: "employee",
      seenIds: employees.rows.map((row) => row.employeeUuid),
      archivedAt: now(),
    }),
  ]);

  return {
    syncRunId: "pending",
    syncMode: "incremental_refresh",
    status: "succeeded",
    startedAt: now(),
    finishedAt: now(),
    triggeredBy: null,
    triggerSource: "schedule",
    employeesSeen: employeeSource.records.length,
    employeesUpserted,
    departmentsSeen: departmentSource.records.length,
    departmentsUpserted,
    brandsSeen: brandSource.records.length,
    brandsUpserted,
    projectsSeen: campaignSource.records.length + pitchSource.records.length,
    projectsUpserted,
    recordsArchived: departmentsArchived + brandsArchived + projectsArchived + employeesArchived,
    issueCount:
      departments.issues.length + brands.issues.length + projects.issues.length + employees.issues.length,
    errorMessage: null,
    metadata: {
      source: "timetrack",
      mode: "incremental_refresh",
      changedDepartments: changedDepartments.length,
      changedBrands: changedBrands.length,
      changedProjects: changedProjects.length,
      changedEmployees: changedEmployees.length,
    },
  };
}

async function runTargetedRepair(
  input: SyncInput,
  repository: PlannerDirectoryRepository,
  source: PlannerDirectorySource,
  now: () => string
): Promise<SyncSummary> {
  const scope = input.scope ?? {};
  const issues: SyncSummary["issueCount"] = 0;
  let employeesUpserted = 0;
  let departmentsUpserted = 0;
  let brandsUpserted = 0;
  let projectsUpserted = 0;

  if (scope.entityType === "employee" && scope.sourceId) {
    const record = await source.fetchEmployeeByUuid(input.session, scope.sourceId);
    if (record) {
      const normalized = normalizeEmployeeSource(record);
      if (normalized) {
        employeesUpserted = await repository.upsertEmployees([normalized]);
      }
    }
  } else if (scope.entityType === "brand" && scope.sourceId) {
    const record = await source.fetchBrandById(input.session, scope.sourceId);
    if (record) {
      const normalized = normalizeBrandSource(record);
      if (normalized) {
        brandsUpserted = await repository.upsertBrands([normalized]);
      }
    }
  } else if (scope.entityType === "department" && scope.sourceId) {
    const record = await source.fetchDepartmentById(input.session, scope.sourceId);
    if (record) {
      const normalized = normalizeDepartmentSource(record as Parameters<typeof normalizeDepartmentSource>[0]);
      if (normalized) {
        departmentsUpserted = await repository.upsertDepartments([normalized]);
      }
    }
  } else if (scope.entityType === "project" && scope.sourceId) {
    const key = scope.projectKey ? parseProjectKey(scope.projectKey) : null;
    const sourceId = scope.sourceId;
    const campaign = await source.fetchCampaignByUuid(input.session, sourceId);
    const pitch = campaign ? null : await source.fetchPitchByUuid(input.session, sourceId);
    const record = campaign ?? pitch;
    const sourceType = key?.sourceType ?? (campaign ? "campaign" : "pitch");
    if (record) {
      const normalized = normalizeProjectSource(record, sourceType);
      if (normalized) {
        projectsUpserted = await repository.upsertProjects([normalized]);
      }
    }
  }

  return {
    syncRunId: "pending",
    syncMode: "targeted_repair",
    status: "succeeded",
    startedAt: now(),
    finishedAt: now(),
    triggeredBy: input.triggeredBy ?? null,
    triggerSource: input.triggerSource,
    employeesSeen: employeesUpserted,
    employeesUpserted,
    departmentsSeen: departmentsUpserted,
    departmentsUpserted,
    brandsSeen: brandsUpserted,
    brandsUpserted,
    projectsSeen: projectsUpserted,
    projectsUpserted,
    recordsArchived: 0,
    issueCount: issues,
    errorMessage: null,
    metadata: {
      scope,
      source: "timetrack",
    },
  };
}

export async function runPlannerDirectorySync(
  input: SyncInput,
  dependencies: SyncEngineDependencies = {}
): Promise<SyncSummary> {
  const repository = dependencies.repository ?? plannerDirectoryRepository;
  const source = dependencies.source ?? defaultSource;
  const now = dependencies.now ?? (() => new Date().toISOString());

  const run = await repository.createSyncRun({
    syncMode: input.syncMode,
    triggerSource: input.triggerSource,
    triggeredBy: input.triggeredBy ?? null,
    metadata: {
      scope: input.scope ?? null,
    },
  });

  await repository.updateSyncRun(run.syncRunId, {
    status: "running",
    startedAt: run.startedAt,
  });

  try {
    const summary =
      input.syncMode === "full_backfill"
        ? await runBackfill(input.session, repository, source, now)
        : input.syncMode === "incremental_refresh"
          ? await runIncremental(input.session, repository, source, now)
          : await runTargetedRepair(input, repository, source, now);

    const finalized = await repository.updateSyncRun(run.syncRunId, {
      status: "succeeded",
      finishedAt: now(),
      employeesSeen: summary.employeesSeen,
      employeesUpserted: summary.employeesUpserted,
      departmentsSeen: summary.departmentsSeen,
      departmentsUpserted: summary.departmentsUpserted,
      brandsSeen: summary.brandsSeen,
      brandsUpserted: summary.brandsUpserted,
      projectsSeen: summary.projectsSeen,
      projectsUpserted: summary.projectsUpserted,
      recordsArchived: summary.recordsArchived,
      issueCount: summary.issueCount,
      errorMessage: null,
      metadata: summary.metadata,
    });

    return {
      ...(finalized ?? summary),
      issues: summary.issueCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Planner directory sync failed";
    await repository.updateSyncRun(run.syncRunId, {
      status: "failed",
      finishedAt: now(),
      errorMessage: message,
    });
    throw error;
  }
}

export function getPlannerDirectoryProjectKey(sourceType: PlannerDirectorySourceType, sourceId: string): string {
  return buildPlannerProjectKey(sourceType, sourceId);
}
