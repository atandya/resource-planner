import { assignmentsDb, getDbClient } from "@/lib/mysql-assignments/db";
import type {
  PlannerDirectoryBrandRow,
  PlannerDirectoryDepartmentRow,
  PlannerDirectoryEmployeeRow,
  PlannerDirectoryIssueSeverity,
  PlannerDirectoryProjectRow,
  PlannerDirectorySourceType,
  PlannerDirectorySyncIssue,
  PlannerDirectorySyncRun,
  PlannerSyncMode,
  PlannerSyncStatus,
} from "@/lib/planner-directory/types";
import { chunkRowsForBatching, getPlannerDirectoryBatchSize } from "@/lib/planner-directory/write-batches";
import { shouldSkipArchive } from "./archive-guard";

type PlannerDirectoryDb = {
  query(sql: string, params?: unknown[]): Promise<unknown>;
};

type PlannerDirectoryClock = () => string;

type PlannerDirectoryRepositoryOptions = {
  db?: PlannerDirectoryDb;
  now?: PlannerDirectoryClock;
  syncRunIdFactory?: () => string;
  issueIdFactory?: () => string;
};

type SqlDialect = "mysql" | "postgresql";

type DbRow = Record<string, unknown>;

const DEFAULT_DB = assignmentsDb as unknown as PlannerDirectoryDb;

function defaultNow(): string {
  return new Date().toISOString();
}

function defaultId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function getDialect(): SqlDialect {
  return getDbClient() === "postgresql" ? "postgresql" : "mysql";
}

function readRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    if (result.length > 0 && Array.isArray(result[0])) {
      return result[0] as T[];
    }
    if (result.every((entry) => typeof entry === "object")) {
      return result as T[];
    }
  }

  if (result && typeof result === "object" && "rows" in result) {
    return ((result as { rows?: T[] }).rows ?? []) as T[];
  }

  return [];
}

function readFirstRow<T>(result: unknown): T | null {
  const rows = readRows<T>(result);
  return rows[0] ?? null;
}

function toSqlPlaceholders(count: number, dialect: SqlDialect): string {
  if (dialect === "postgresql") {
    return Array.from({ length: count }, (_, index) => `$${index + 1}`).join(", ");
  }

  return Array.from({ length: count }, () => "?").join(", ");
}

function mapDepartmentRow(row: PlannerDirectoryDepartmentRow): DbRow {
  return {
    department_id: row.departmentId,
    source_department_id: row.sourceDepartmentId,
    name: row.name,
    code: row.code,
    color: row.color,
    is_active: row.isActive,
    source_updated_at: row.sourceUpdatedAt,
    source_hash: row.sourceHash,
    synced_at: row.syncedAt,
    last_seen_at: row.lastSeenAt,
    archived_at: row.archivedAt,
  };
}

function mapBrandRow(row: PlannerDirectoryBrandRow): DbRow {
  return {
    brand_id: row.brandId,
    source_brand_id: row.sourceBrandId,
    source_uuid: row.sourceUuid,
    name: row.name,
    company_name: row.companyName,
    color: row.color,
    status: row.status,
    source_updated_at: row.sourceUpdatedAt,
    source_hash: row.sourceHash,
    synced_at: row.syncedAt,
    last_seen_at: row.lastSeenAt,
    archived_at: row.archivedAt,
  };
}

function mapProjectRow(row: PlannerDirectoryProjectRow): DbRow {
  return {
    project_key: row.projectKey,
    source_project_id: row.sourceProjectId,
    source_type: row.sourceType,
    name: row.name,
    brand_id: row.brandId,
    color: row.color,
    status: row.status,
    start_date: row.startDate,
    end_date: row.endDate,
    submit_date: row.submitDate,
    source_updated_at: row.sourceUpdatedAt,
    source_hash: row.sourceHash,
    synced_at: row.syncedAt,
    last_seen_at: row.lastSeenAt,
    archived_at: row.archivedAt,
  };
}

function mapEmployeeRow(row: PlannerDirectoryEmployeeRow): DbRow {
  return {
    employee_uuid: row.employeeUuid,
    source_employee_id: row.sourceEmployeeId,
    employee_number: row.employeeNumber,
    nik: row.nik,
    full_name: row.fullName,
    nickname: row.nickname,
    email: row.email,
    photo: row.photo,
    position: row.position,
    department_id: row.departmentId,
    weekly_capacity: row.weeklyCapacity,
    employment_status: row.employmentStatus,
    visibility: row.visibility,
    work_start_date: row.workStartDate,
    source_updated_at: row.sourceUpdatedAt,
    source_hash: row.sourceHash,
    synced_at: row.syncedAt,
    last_seen_at: row.lastSeenAt,
    archived_at: row.archivedAt,
  };
}

function mapDepartmentReadRow(row: DbRow): PlannerDirectoryDepartmentRow {
  return {
    departmentId: String(row.department_id),
    sourceDepartmentId: row.source_department_id ? String(row.source_department_id) : null,
    name: String(row.name ?? ""),
    code: row.code ? String(row.code) : null,
    color: row.color ? String(row.color) : null,
    isActive: Boolean(row.is_active),
    sourceUpdatedAt: row.source_updated_at ? String(row.source_updated_at) : null,
    sourceHash: String(row.source_hash ?? ""),
    syncedAt: String(row.synced_at ?? ""),
    lastSeenAt: String(row.last_seen_at ?? ""),
    archivedAt: row.archived_at ? String(row.archived_at) : null,
  };
}

function mapBrandReadRow(row: DbRow): PlannerDirectoryBrandRow {
  return {
    brandId: String(row.brand_id),
    sourceBrandId: row.source_brand_id ? String(row.source_brand_id) : null,
    sourceUuid: row.source_uuid ? String(row.source_uuid) : null,
    name: String(row.name ?? ""),
    companyName: row.company_name ? String(row.company_name) : null,
    color: row.color ? String(row.color) : null,
    status: String(row.status ?? "active"),
    sourceUpdatedAt: row.source_updated_at ? String(row.source_updated_at) : null,
    sourceHash: String(row.source_hash ?? ""),
    syncedAt: String(row.synced_at ?? ""),
    lastSeenAt: String(row.last_seen_at ?? ""),
    archivedAt: row.archived_at ? String(row.archived_at) : null,
  };
}

function mapProjectReadRow(row: DbRow): PlannerDirectoryProjectRow {
  return {
    projectKey: String(row.project_key),
    sourceProjectId: String(row.source_project_id ?? ""),
    sourceType: String(row.source_type ?? "campaign") as PlannerDirectoryProjectRow["sourceType"],
    name: String(row.name ?? ""),
    brandId: row.brand_id ? String(row.brand_id) : null,
    brandName: row.brand_name ? String(row.brand_name) : null,
    brandCompanyName: row.brand_company_name ? String(row.brand_company_name) : null,
    color: row.color ? String(row.color) : null,
    status: String(row.status ?? "active"),
    startDate: row.start_date ? String(row.start_date) : null,
    endDate: row.end_date ? String(row.end_date) : null,
    submitDate: row.submit_date ? String(row.submit_date) : null,
    sourceUpdatedAt: row.source_updated_at ? String(row.source_updated_at) : null,
    sourceHash: String(row.source_hash ?? ""),
    syncedAt: String(row.synced_at ?? ""),
    lastSeenAt: String(row.last_seen_at ?? ""),
    archivedAt: row.archived_at ? String(row.archived_at) : null,
  };
}

function buildUpsertStatement(
  table: string,
  rows: DbRow[],
  conflictColumns: string[],
  dialect: SqlDialect
): { sql: string; params: unknown[] } {
  if (rows.length === 0) {
    return { sql: "", params: [] };
  }

  const columns = Object.keys(rows[0]);
  const params: unknown[] = [];
  const valueGroups: string[] = [];

  rows.forEach((row, rowIndex) => {
    const placeholders = columns.map((column, columnIndex) => {
      const paramIndex = rowIndex * columns.length + columnIndex;
      params.push(row[column]);
      return dialect === "postgresql" ? `$${paramIndex + 1}` : "?";
    });
    valueGroups.push(`(${placeholders.join(", ")})`);
  });

  const updates = columns
    .filter((column) => !conflictColumns.includes(column))
    .map((column) =>
      dialect === "postgresql"
        ? `${column} = EXCLUDED.${column}`
        : `${column} = VALUES(${column})`
    )
    .join(", ");

  if (dialect === "postgresql") {
    return {
      sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${valueGroups.join(", ")} ON CONFLICT (${conflictColumns.join(", ")}) DO UPDATE SET ${updates}`,
      params,
    };
  }

  return {
    sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${valueGroups.join(", ")} ON DUPLICATE KEY UPDATE ${updates}`,
    params,
  };
}

function escapeLikePattern(value: string): string {
  return `%${value.trim().toLowerCase().replace(/[!%_]/g, "!$&")}%`;
}

function buildLikeSearchClause(
  columns: string[],
  search: string | null | undefined,
  dialect: SqlDialect,
  params: unknown[]
): string {
  const term = search?.trim();
  if (!term) {
    return "";
  }

  const pattern = escapeLikePattern(term);
  const comparisons = columns.map((column) => {
    params.push(pattern);
    const placeholder = dialect === "postgresql" ? `$${params.length}` : "?";
    return `LOWER(COALESCE(${column}, '')) LIKE ${placeholder} ESCAPE '!'`;
  });

  return comparisons.length > 0 ? `(${comparisons.join(" OR ")})` : "";
}

function buildInClause(
  column: string,
  values: string[],
  dialect: SqlDialect,
  params: unknown[]
): string {
  if (values.length === 0) {
    return "";
  }

  const placeholders = values.map((value) => {
    params.push(value);
    return dialect === "postgresql" ? `$${params.length}` : "?";
  });

  return `${column} IN (${placeholders.join(", ")})`;
}

async function upsertRowsInBatches(
  db: PlannerDirectoryDb,
  dialect: SqlDialect,
  args: {
    table: string;
    entityLabel: string;
    rows: DbRow[];
    conflictColumns: string[];
  }
): Promise<number> {
  if (args.rows.length === 0) {
    return 0;
  }

  const columnCount = Object.keys(args.rows[0] ?? {}).length;
  const batchSize = getPlannerDirectoryBatchSize({
    columnCount,
    dialect,
  });
  const batches = chunkRowsForBatching(args.rows, batchSize);

  console.info("[Planner Directory Sync] Writing batches", {
    table: args.table,
    entityLabel: args.entityLabel,
    totalRows: args.rows.length,
    batchSize,
    batchCount: batches.length,
    dialect,
  });

  let total = 0;
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    const statement = buildUpsertStatement(args.table, batch, args.conflictColumns, dialect);

    console.info("[Planner Directory Sync] Executing batch", {
      table: args.table,
      entityLabel: args.entityLabel,
      batchNumber: batchIndex + 1,
      batchCount: batches.length,
      rows: batch.length,
      params: statement.params.length,
    });

    await db.query(statement.sql, statement.params);
    total += batch.length;
  }

  return total;
}

export function createPlannerDirectoryRepository(options: PlannerDirectoryRepositoryOptions = {}) {
  const db = options.db ?? DEFAULT_DB;
  const now = options.now ?? defaultNow;
  const syncRunIdFactory = options.syncRunIdFactory ?? (() => defaultId("sync"));
  const issueIdFactory = options.issueIdFactory ?? (() => defaultId("issue"));

  const dialect = getDialect();

  async function upsertDepartments(rows: PlannerDirectoryDepartmentRow[]): Promise<number> {
    return upsertRowsInBatches(db, dialect, {
      table: "planner_departments",
      entityLabel: "departments",
      rows: rows.map(mapDepartmentRow),
      conflictColumns: ["department_id"],
    });
  }

  async function upsertBrands(rows: PlannerDirectoryBrandRow[]): Promise<number> {
    return upsertRowsInBatches(db, dialect, {
      table: "planner_brands",
      entityLabel: "brands",
      rows: rows.map(mapBrandRow),
      conflictColumns: ["brand_id"],
    });
  }

  async function upsertProjects(rows: PlannerDirectoryProjectRow[]): Promise<number> {
    return upsertRowsInBatches(db, dialect, {
      table: "planner_projects",
      entityLabel: "projects",
      rows: rows.map(mapProjectRow),
      conflictColumns: ["project_key"],
    });
  }

  async function upsertEmployees(rows: PlannerDirectoryEmployeeRow[]): Promise<number> {
    return upsertRowsInBatches(db, dialect, {
      table: "planner_employees",
      entityLabel: "employees",
      rows: rows.map(mapEmployeeRow),
      conflictColumns: ["employee_uuid"],
    });
  }

  async function markMissingAsArchived(args: {
    entity: "department" | "brand" | "project" | "employee";
    seenIds: string[];
    archivedAt?: string;
  }): Promise<number> {
    // Never archive the whole table when a sync saw nothing — see archive-guard.ts.
    if (shouldSkipArchive(args.seenIds)) return 0;
    const archivedAt = args.archivedAt ?? now();
    const tableMap = {
      department: { table: "planner_departments", key: "department_id" },
      brand: { table: "planner_brands", key: "brand_id" },
      project: { table: "planner_projects", key: "project_key" },
      employee: { table: "planner_employees", key: "employee_uuid" },
    } as const;
    const target = tableMap[args.entity];
    const params: unknown[] = [archivedAt];
    const whereClause =
      args.seenIds.length > 0
        ? (() => {
            const placeholders = args.seenIds
              .map((seenId) => {
                params.push(seenId);
                return dialect === "postgresql" ? `$${params.length}` : "?";
              })
              .join(", ");
            return `WHERE ${target.key} NOT IN (${placeholders})`;
          })()
        : "";
    const sql = `UPDATE ${target.table} SET archived_at = ${dialect === "postgresql" ? "$1" : "?"} ${whereClause}`;
    await db.query(sql, params);
    return args.seenIds.length;
  }

  async function archiveBrandBySourceUuid(sourceUuid: string, archivedAt: string = now()): Promise<void> {
    const sql = `UPDATE planner_brands SET archived_at = ${dialect === "postgresql" ? "$1" : "?"} WHERE source_uuid = ${dialect === "postgresql" ? "$2" : "?"}`;
    await db.query(sql, [archivedAt, sourceUuid]);
  }

  async function archiveProjectBySource(
    sourceType: PlannerDirectorySourceType,
    sourceUuid: string,
    archivedAt: string = now()
  ): Promise<void> {
    const sql = `UPDATE planner_projects SET archived_at = ${dialect === "postgresql" ? "$1" : "?"} WHERE source_type = ${dialect === "postgresql" ? "$2" : "?"} AND source_project_id = ${dialect === "postgresql" ? "$3" : "?"}`;
    await db.query(sql, [archivedAt, sourceType, sourceUuid]);
  }

  async function createSyncRun(input: {
    syncMode: PlannerSyncMode;
    triggerSource: string;
    triggeredBy?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<PlannerDirectorySyncRun> {
    const syncRunId = syncRunIdFactory();
    const startedAt = now();
    const row: PlannerDirectorySyncRun = {
      syncRunId,
      syncMode: input.syncMode,
      status: "queued",
      startedAt,
      finishedAt: null,
      triggeredBy: input.triggeredBy ?? null,
      triggerSource: input.triggerSource,
      employeesSeen: 0,
      employeesUpserted: 0,
      departmentsSeen: 0,
      departmentsUpserted: 0,
      brandsSeen: 0,
      brandsUpserted: 0,
      projectsSeen: 0,
      projectsUpserted: 0,
      recordsArchived: 0,
      issueCount: 0,
      errorMessage: null,
      metadata: input.metadata ?? null,
    };

    const columns = Object.keys({
      sync_run_id: row.syncRunId,
      sync_mode: row.syncMode,
      status: row.status,
      started_at: row.startedAt,
      finished_at: row.finishedAt,
      triggered_by: row.triggeredBy,
      trigger_source: row.triggerSource,
      employees_seen: row.employeesSeen,
      employees_upserted: row.employeesUpserted,
      departments_seen: row.departmentsSeen,
      departments_upserted: row.departmentsUpserted,
      brands_seen: row.brandsSeen,
      brands_upserted: row.brandsUpserted,
      projects_seen: row.projectsSeen,
      projects_upserted: row.projectsUpserted,
      records_archived: row.recordsArchived,
      issue_count: row.issueCount,
      error_message: row.errorMessage,
      metadata: row.metadata,
    });
    const values = [
      row.syncRunId,
      row.syncMode,
      row.status,
      row.startedAt,
      row.finishedAt,
      row.triggeredBy,
      row.triggerSource,
      row.employeesSeen,
      row.employeesUpserted,
      row.departmentsSeen,
      row.departmentsUpserted,
      row.brandsSeen,
      row.brandsUpserted,
      row.projectsSeen,
      row.projectsUpserted,
      row.recordsArchived,
      row.issueCount,
      row.errorMessage,
      JSON.stringify(row.metadata),
    ];
    const placeholders = toSqlPlaceholders(columns.length, dialect);
    await db.query(
      `INSERT INTO planner_directory_sync_runs (${columns.join(", ")}) VALUES (${placeholders})`,
      values
    );
    return row;
  }

  async function updateSyncRun(
    syncRunId: string,
    updates: Partial<PlannerDirectorySyncRun>
  ): Promise<PlannerDirectorySyncRun | null> {
    const allowedUpdates: Array<[string, unknown]> = [
      ["status", updates.status],
      ["finished_at", updates.finishedAt],
      ["employees_seen", updates.employeesSeen],
      ["employees_upserted", updates.employeesUpserted],
      ["departments_seen", updates.departmentsSeen],
      ["departments_upserted", updates.departmentsUpserted],
      ["brands_seen", updates.brandsSeen],
      ["brands_upserted", updates.brandsUpserted],
      ["projects_seen", updates.projectsSeen],
      ["projects_upserted", updates.projectsUpserted],
      ["records_archived", updates.recordsArchived],
      ["issue_count", updates.issueCount],
      ["error_message", updates.errorMessage],
      ["metadata", updates.metadata ? JSON.stringify(updates.metadata) : null],
    ].filter(([, value]) => value !== undefined);

    if (allowedUpdates.length === 0) {
      return getSyncRunById(syncRunId);
    }

    const params: unknown[] = [];
    const assignments = allowedUpdates.map(([column, value], index) => {
      params.push(value);
      return `${column} = ${dialect === "postgresql" ? `$${index + 1}` : "?"}`;
    });
    params.push(syncRunId);
    await db.query(
      `UPDATE planner_directory_sync_runs SET ${assignments.join(", ")} WHERE sync_run_id = ${dialect === "postgresql" ? `$${params.length}` : "?"}`,
      params
    );
    return getSyncRunById(syncRunId);
  }

  async function addSyncIssue(input: {
    syncRunId: string;
    entityType: string;
    sourceId: string | null;
    severity: PlannerDirectoryIssueSeverity;
    message: string;
    payload?: Record<string, unknown> | null;
  }): Promise<PlannerDirectorySyncIssue> {
    const issue: PlannerDirectorySyncIssue = {
      issueId: issueIdFactory(),
      syncRunId: input.syncRunId,
      entityType: input.entityType,
      sourceId: input.sourceId,
      severity: input.severity,
      message: input.message,
      payload: input.payload ?? null,
      createdAt: now(),
    };

    const columns = [
      "issue_id",
      "sync_run_id",
      "entity_type",
      "source_id",
      "severity",
      "message",
      "payload",
      "created_at",
    ];
    const params = [
      issue.issueId,
      issue.syncRunId,
      issue.entityType,
      issue.sourceId,
      issue.severity,
      issue.message,
      issue.payload ? JSON.stringify(issue.payload) : null,
      issue.createdAt,
    ];
    await db.query(
      `INSERT INTO planner_directory_sync_issues (${columns.join(", ")}) VALUES (${toSqlPlaceholders(
        columns.length,
        dialect
      )})`,
      params
    );
    return issue;
  }

  async function getSyncRunById(syncRunId: string): Promise<PlannerDirectorySyncRun | null> {
    const result = await db.query(
      `SELECT * FROM planner_directory_sync_runs WHERE sync_run_id = ${dialect === "postgresql" ? "$1" : "?"} LIMIT 1`,
      [syncRunId]
    );
    const row = readFirstRow<DbRow>(result);
    return row
      ? {
          syncRunId: String(row.sync_run_id ?? row.syncRunId ?? syncRunId),
          syncMode: String(row.sync_mode ?? row.syncMode ?? "full_backfill") as PlannerSyncMode,
          status: String(row.status ?? "queued") as PlannerSyncStatus,
          startedAt: String(row.started_at ?? row.startedAt ?? now()),
          finishedAt: row.finished_at ? String(row.finished_at) : null,
          triggeredBy: row.triggered_by ? String(row.triggered_by) : null,
          triggerSource: row.trigger_source ? String(row.trigger_source) : null,
          employeesSeen: Number(row.employees_seen ?? 0),
          employeesUpserted: Number(row.employees_upserted ?? 0),
          departmentsSeen: Number(row.departments_seen ?? 0),
          departmentsUpserted: Number(row.departments_upserted ?? 0),
          brandsSeen: Number(row.brands_seen ?? 0),
          brandsUpserted: Number(row.brands_upserted ?? 0),
          projectsSeen: Number(row.projects_seen ?? 0),
          projectsUpserted: Number(row.projects_upserted ?? 0),
          recordsArchived: Number(row.records_archived ?? 0),
          issueCount: Number(row.issue_count ?? 0),
          errorMessage: row.error_message ? String(row.error_message) : null,
          metadata: row.metadata ? (typeof row.metadata === "string" ? JSON.parse(String(row.metadata)) : (row.metadata as Record<string, unknown>)) : null,
        }
      : null;
  }

  async function getLatestSuccessfulSync(): Promise<PlannerDirectorySyncRun | null> {
    const result = await db.query(
      `SELECT * FROM planner_directory_sync_runs WHERE status = ${dialect === "postgresql" ? "$1" : "?"} ORDER BY finished_at DESC NULLS LAST, started_at DESC LIMIT 1`,
      ["succeeded"]
    );
    const row = readFirstRow<DbRow>(result);
    return row
      ? {
          syncRunId: String(row.sync_run_id ?? row.syncRunId),
          syncMode: String(row.sync_mode ?? row.syncMode ?? "full_backfill") as PlannerSyncMode,
          status: String(row.status ?? "succeeded") as PlannerSyncStatus,
          startedAt: String(row.started_at ?? row.startedAt ?? now()),
          finishedAt: row.finished_at ? String(row.finished_at) : null,
          triggeredBy: row.triggered_by ? String(row.triggered_by) : null,
          triggerSource: row.trigger_source ? String(row.trigger_source) : null,
          employeesSeen: Number(row.employees_seen ?? 0),
          employeesUpserted: Number(row.employees_upserted ?? 0),
          departmentsSeen: Number(row.departments_seen ?? 0),
          departmentsUpserted: Number(row.departments_upserted ?? 0),
          brandsSeen: Number(row.brands_seen ?? 0),
          brandsUpserted: Number(row.brands_upserted ?? 0),
          projectsSeen: Number(row.projects_seen ?? 0),
          projectsUpserted: Number(row.projects_upserted ?? 0),
          recordsArchived: Number(row.records_archived ?? 0),
          issueCount: Number(row.issue_count ?? 0),
          errorMessage: row.error_message ? String(row.error_message) : null,
          metadata: row.metadata ? (typeof row.metadata === "string" ? JSON.parse(String(row.metadata)) : (row.metadata as Record<string, unknown>)) : null,
        }
      : null;
  }

  async function getLatestInFlightSync(): Promise<PlannerDirectorySyncRun | null> {
    const result = await db.query(
      `SELECT * FROM planner_directory_sync_runs WHERE status IN (${dialect === "postgresql" ? "$1, $2" : "?, ?"}) ORDER BY started_at DESC LIMIT 1`,
      ["queued", "running"]
    );
    const row = readFirstRow<DbRow>(result);
    return row
      ? {
          syncRunId: String(row.sync_run_id ?? row.syncRunId),
          syncMode: String(row.sync_mode ?? row.syncMode ?? "full_backfill") as PlannerSyncMode,
          status: String(row.status ?? "queued") as PlannerSyncStatus,
          startedAt: String(row.started_at ?? row.startedAt ?? now()),
          finishedAt: row.finished_at ? String(row.finished_at) : null,
          triggeredBy: row.triggered_by ? String(row.triggered_by) : null,
          triggerSource: row.trigger_source ? String(row.trigger_source) : null,
          employeesSeen: Number(row.employees_seen ?? 0),
          employeesUpserted: Number(row.employees_upserted ?? 0),
          departmentsSeen: Number(row.departments_seen ?? 0),
          departmentsUpserted: Number(row.departments_upserted ?? 0),
          brandsSeen: Number(row.brands_seen ?? 0),
          brandsUpserted: Number(row.brands_upserted ?? 0),
          projectsSeen: Number(row.projects_seen ?? 0),
          projectsUpserted: Number(row.projects_upserted ?? 0),
          recordsArchived: Number(row.records_archived ?? 0),
          issueCount: Number(row.issue_count ?? 0),
          errorMessage: row.error_message ? String(row.error_message) : null,
          metadata: row.metadata ? (typeof row.metadata === "string" ? JSON.parse(String(row.metadata)) : (row.metadata as Record<string, unknown>)) : null,
        }
      : null;
  }

  async function listDepartments(): Promise<PlannerDirectoryDepartmentRow[]> {
    const result = await db.query(
      `SELECT * FROM planner_departments ORDER BY name ASC`
    );
    return readRows<DbRow>(result).map(mapDepartmentReadRow);
  }

  async function listDepartmentsForFilterOptions(): Promise<PlannerDirectoryDepartmentRow[]> {
    const result = await db.query(
      `SELECT * FROM planner_departments WHERE archived_at IS NULL ORDER BY name ASC`,
      []
    );
    return readRows<DbRow>(result).map(mapDepartmentReadRow);
  }

  async function listBrands(): Promise<PlannerDirectoryBrandRow[]> {
    const result = await db.query(`SELECT * FROM planner_brands ORDER BY name ASC`);
    return readRows<DbRow>(result).map(mapBrandReadRow);
  }

  async function listBrandsForFilterOptions(args: {
    search?: string | null;
    limit: number;
    offset: number;
  } = { limit: 50, offset: 0 }): Promise<{
    data: PlannerDirectoryBrandRow[];
    total: number;
    hasMore: boolean;
  }> {
    const params: unknown[] = [];
    const whereClauses = ["archived_at IS NULL"];

    const searchClause = buildLikeSearchClause(["name", "company_name"], args.search, dialect, params);
    if (searchClause) whereClauses.push(searchClause);

    params.push(args.limit);
    const limitPlaceholder = dialect === "postgresql" ? `$${params.length}` : "?";
    params.push(args.offset);
    const offsetPlaceholder = dialect === "postgresql" ? `$${params.length}` : "?";

    const result = await db.query(
      `
        SELECT *, COUNT(*) OVER() AS total_count
        FROM planner_brands
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY name ASC, brand_id ASC
        LIMIT ${limitPlaceholder}
        OFFSET ${offsetPlaceholder}
      `,
      params
    );

    const rows = readRows<DbRow>(result);
    const total = rows.length > 0 ? Number(rows[0]?.total_count ?? 0) : args.offset;
    return {
      data: rows.map(mapBrandReadRow),
      total,
      hasMore: total > args.offset + rows.length,
    };
  }

  async function listProjects(): Promise<PlannerDirectoryProjectRow[]> {
    const result = await db.query(`SELECT * FROM planner_projects ORDER BY name ASC`);
    return readRows<DbRow>(result).map(mapProjectReadRow);
  }

  async function listEmployees(): Promise<PlannerDirectoryEmployeeRow[]> {
    const result = await db.query(`SELECT * FROM planner_employees ORDER BY full_name ASC`);
    return readRows<DbRow>(result).map((row) => ({
      employeeUuid: String(row.employee_uuid),
      sourceEmployeeId: row.source_employee_id ? String(row.source_employee_id) : null,
      employeeNumber: row.employee_number ? String(row.employee_number) : null,
      nik: row.nik ? String(row.nik) : null,
      fullName: String(row.full_name ?? ""),
      nickname: row.nickname ? String(row.nickname) : null,
      email: row.email ? String(row.email) : null,
      photo: row.photo ? String(row.photo) : null,
      position: row.position ? String(row.position) : null,
      departmentId: row.department_id ? String(row.department_id) : null,
      weeklyCapacity: Number(row.weekly_capacity ?? 40),
      employmentStatus: String(row.employment_status ?? "active"),
      visibility: String(row.visibility ?? "active"),
      workStartDate: row.work_start_date ? String(row.work_start_date) : null,
      sourceUpdatedAt: row.source_updated_at ? String(row.source_updated_at) : null,
      sourceHash: String(row.source_hash ?? ""),
      syncedAt: String(row.synced_at ?? ""),
      lastSeenAt: String(row.last_seen_at ?? ""),
      archivedAt: row.archived_at ? String(row.archived_at) : null,
    }));
  }

  // EXISTS over one assignment table for the brand/project employee scoping —
  // both planner_* and assignments tables live in the same database (the
  // repository's default db IS assignmentsDb).
  function buildAssignmentExistsClause(
    table: "assignments" | "actual",
    projectIds: string[] | null,
    range: { startDate: string; endDate: string },
    params: unknown[]
  ): string {
    // projectIds null/empty → no project scoping: matches any of the employee's
    // assignments in range (used by the active-employee filter, which only
    // cares whether work exists, not on which project).
    const projectClause =
      projectIds && projectIds.length > 0
        ? ` AND ${buildInClause("x.project_uuid", projectIds, dialect, params)}`
        : "";
    params.push(range.startDate);
    const startPlaceholder = dialect === "postgresql" ? `$${params.length}` : "?";
    params.push(range.endDate);
    const endPlaceholder = dialect === "postgresql" ? `$${params.length}` : "?";

    // Cross-type time-off exclusion: ::integer keeps this valid whether
    // is_time_off is stored as integer (live DB) or boolean (schema file).
    const timeOffExclusion =
      dialect === "postgresql"
        ? "COALESCE(x.is_time_off::integer, 0) = 0"
        : "COALESCE(x.is_time_off, 0) = 0";

    return `EXISTS (SELECT 1 FROM ${table} x WHERE x.employee_uuid = e.employee_uuid${projectClause} AND x.end_date >= ${startPlaceholder} AND x.start_date <= ${endPlaceholder} AND ${timeOffExclusion})`;
  }

  function mapEmployeeReadRow(row: DbRow): PlannerDirectoryEmployeeRow {
    return {
      employeeUuid: String(row.employee_uuid),
      sourceEmployeeId: row.source_employee_id ? String(row.source_employee_id) : null,
      employeeNumber: row.employee_number ? String(row.employee_number) : null,
      nik: row.nik ? String(row.nik) : null,
      fullName: String(row.full_name ?? ""),
      nickname: row.nickname ? String(row.nickname) : null,
      email: row.email ? String(row.email) : null,
      photo: row.photo ? String(row.photo) : null,
      position: row.position ? String(row.position) : null,
      departmentId: row.department_id ? String(row.department_id) : null,
      weeklyCapacity: Number(row.weekly_capacity ?? 40),
      employmentStatus: String(row.employment_status ?? "active"),
      visibility: String(row.visibility ?? "active"),
      workStartDate: row.work_start_date ? String(row.work_start_date) : null,
      sourceUpdatedAt: row.source_updated_at ? String(row.source_updated_at) : null,
      sourceHash: String(row.source_hash ?? ""),
      syncedAt: String(row.synced_at ?? ""),
      lastSeenAt: String(row.last_seen_at ?? ""),
      archivedAt: row.archived_at ? String(row.archived_at) : null,
    };
  }

  async function listEmployeesForBootstrap(args: {
    offset: number;
    limit: number;
    search?: string | null;
    department?: string | null;
    employeeUuid?: string | null;
    assignmentProjectIds?: string[] | null;
    assignmentRange?: { startDate: string; endDate: string } | null;
  }): Promise<{
    data: PlannerDirectoryEmployeeRow[];
    total: number;
    hasMore: boolean;
  }> {
    const params: unknown[] = [];
    const whereClauses = ["e.archived_at IS NULL"];

    if (args.employeeUuid) {
      params.push(args.employeeUuid);
      whereClauses.push(`e.employee_uuid = ${dialect === "postgresql" ? `$${params.length}` : "?"}`);
    }

    // Department filters the page server-side: bootstrap pages are the
    // timeline's only employee source, so a client-only filter would reveal a
    // department's members progressively as pages load instead of completely.
    if (args.department) {
      params.push(args.department);
      whereClauses.push(`e.department_id = ${dialect === "postgresql" ? `$${params.length}` : "?"}`);
    }

    // Active-employee filter: active employees always show; an inactive
    // employee surfaces only when they still have a planned (non-time-off)
    // assignment overlapping the visible range. Because the timeline's view
    // ranges are calendar-aligned, a yearly view (Jan–Dec) can resurface
    // someone who left mid-year, while a quarter view that no longer contains
    // their work hides them — the range does the work, no per-view logic.
    // Skipped for the self-scoped fetch (employeeUuid) so a user always sees
    // their own row regardless of status.
    if (!args.employeeUuid && args.assignmentRange) {
      const plannedInRange = buildAssignmentExistsClause("assignments", null, args.assignmentRange, params);
      whereClauses.push(`(e.employment_status = 'active' OR ${plannedInRange})`);
    }

    // Brand/project filters get the same treatment: only employees with a
    // planned or actual assignment on the scoped projects inside the visible
    // range make the page, so employeeTotal/hasMore describe the filtered set.
    if (args.assignmentProjectIds && args.assignmentProjectIds.length > 0 && args.assignmentRange) {
      const planExists = buildAssignmentExistsClause("assignments", args.assignmentProjectIds, args.assignmentRange, params);
      const actualExists = buildAssignmentExistsClause("actual", args.assignmentProjectIds, args.assignmentRange, params);
      whereClauses.push(`(${planExists} OR ${actualExists})`);
    }

    const searchClause = buildLikeSearchClause(
      ["e.full_name", "e.nickname", "e.position", "d.name"],
      args.search,
      dialect,
      params
    );
    if (searchClause) {
      whereClauses.push(searchClause);
    }

    params.push(args.limit);
    const limitPlaceholder = dialect === "postgresql" ? `$${params.length}` : "?";
    params.push(args.offset);
    const offsetPlaceholder = dialect === "postgresql" ? `$${params.length}` : "?";

    const result = await db.query(
      `
        SELECT e.*
        , COUNT(*) OVER() AS total_count
        FROM planner_employees e
        LEFT JOIN planner_departments d ON d.department_id = e.department_id
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY e.full_name ASC, e.employee_uuid ASC
        LIMIT ${limitPlaceholder}
        OFFSET ${offsetPlaceholder}
      `,
      params
    );

    const rows = readRows<DbRow>(result);
    const total = rows.length > 0 ? Number(rows[0]?.total_count ?? 0) : args.offset;

    return {
      data: rows.map(mapEmployeeReadRow),
      total,
      hasMore: total > args.offset + rows.length,
    };
  }

  async function listTimelineEmployees(args: {
    employeeUuid?: string | null;
    assignmentRange?: { startDate: string; endDate: string } | null;
  }): Promise<PlannerDirectoryEmployeeRow[]> {
    const params: unknown[] = [];
    const whereClauses = ["e.archived_at IS NULL"];

    if (args.employeeUuid) {
      params.push(args.employeeUuid);
      whereClauses.push(`e.employee_uuid = ${dialect === "postgresql" ? `$${params.length}` : "?"}`);
    }

    // Active employees always show; an inactive employee surfaces only when they
    // still have a planned (non-time-off) assignment overlapping the visible
    // range. Skipped for the self-scoped fetch so a user always sees their own row.
    if (!args.employeeUuid && args.assignmentRange) {
      const plannedInRange = buildAssignmentExistsClause("assignments", null, args.assignmentRange, params);
      whereClauses.push(`(e.employment_status = 'active' OR ${plannedInRange})`);
    }

    const result = await db.query(
      `
        SELECT e.*
        FROM planner_employees e
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY e.full_name ASC
      `,
      params
    );

    return readRows<DbRow>(result).map(mapEmployeeReadRow);
  }

  async function listProjectsForBootstrap(args: {
    brandId?: string | null;
    search?: string | null;
    referencedProjectIds?: string[];
  }): Promise<PlannerDirectoryProjectRow[]> {
    const params: unknown[] = [];

    // The "scoped" set is the brand/search catalog subset. The "referenced"
    // set is every project the visible assignments touch and must ALWAYS be
    // present, or the timeline drops lanes for an employee's other-brand work.
    // So referenced is UNIONed with scoped, never intersected.
    const scopedConds: string[] = [];
    if (args.brandId) {
      params.push(args.brandId);
      scopedConds.push(`p.brand_id = ${dialect === "postgresql" ? `$${params.length}` : "?"}`);
    }
    const searchClause = buildLikeSearchClause(["p.name", "b.name", "b.company_name"], args.search, dialect, params);
    if (searchClause) {
      scopedConds.push(searchClause);
    }

    let referencedCond: string | null = null;
    if (args.referencedProjectIds && args.referencedProjectIds.length > 0) {
      referencedCond = buildInClause("p.source_project_id", args.referencedProjectIds, dialect, params);
    }

    const scoped = scopedConds.length > 0 ? `(${scopedConds.join(" AND ")})` : null;
    const whereClauses = ["p.archived_at IS NULL"];
    if (scoped && referencedCond) {
      whereClauses.push(`(${scoped} OR ${referencedCond})`);
    } else if (scoped) {
      whereClauses.push(scoped);
    } else if (referencedCond) {
      whereClauses.push(referencedCond);
    }

    const result = await db.query(
      `
        SELECT p.*
        FROM planner_projects p
        LEFT JOIN planner_brands b ON b.brand_id = p.brand_id
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY p.name ASC
      `,
      params
    );

    return readRows<DbRow>(result).map(mapProjectReadRow);
  }

  async function getProjectForFilterOption(sourceProjectId: string): Promise<PlannerDirectoryProjectRow | null> {
    const params: unknown[] = [sourceProjectId];
    const placeholder = dialect === "postgresql" ? "$1" : "?";
    const result = await db.query(
      `
        SELECT p.*
        FROM planner_projects p
        WHERE p.archived_at IS NULL AND p.source_project_id = ${placeholder}
        LIMIT 1
      `,
      params
    );

    const row = readFirstRow<DbRow>(result);
    return row ? mapProjectReadRow(row) : null;
  }

  async function listProjectsForFilterOptions(args: {
    brandIds?: string[] | null;
    status?: string | null;
    sourceType?: string | null;
    search?: string | null;
    limit: number;
    offset: number;
  } = { limit: 50, offset: 0 }): Promise<{
    data: PlannerDirectoryProjectRow[];
    total: number;
    hasMore: boolean;
  }> {
    const params: unknown[] = [];
    const whereClauses = ["p.archived_at IS NULL"];

    if (args.brandIds && args.brandIds.length > 0) {
      const inClause = buildInClause("p.brand_id", args.brandIds, dialect, params);
      if (inClause) whereClauses.push(inClause);
    }

    if (args.status) {
      params.push(args.status);
      whereClauses.push(`p.status = ${dialect === "postgresql" ? `$${params.length}` : "?"}`);
    }

    if (args.sourceType) {
      params.push(args.sourceType);
      whereClauses.push(`p.source_type = ${dialect === "postgresql" ? `$${params.length}` : "?"}`);
    }

    const searchClause = buildLikeSearchClause(["p.name", "b.name", "b.company_name"], args.search, dialect, params);
    if (searchClause) whereClauses.push(searchClause);

    params.push(args.limit);
    const limitPlaceholder = dialect === "postgresql" ? `$${params.length}` : "?";
    params.push(args.offset);
    const offsetPlaceholder = dialect === "postgresql" ? `$${params.length}` : "?";

    // Small reference table: the LOWER(...) LIKE search seq-scans (<200ms) — a
    // leading-wildcard LIKE can't use a btree index, and pg_trgm is overkill here.
    const result = await db.query(
      `
        SELECT p.*, b.name AS brand_name, b.company_name AS brand_company_name,
               COUNT(*) OVER() AS total_count
        FROM planner_projects p
        LEFT JOIN planner_brands b ON b.brand_id = p.brand_id
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY p.name ASC, p.project_key ASC
        LIMIT ${limitPlaceholder}
        OFFSET ${offsetPlaceholder}
      `,
      params
    );

    const rows = readRows<DbRow>(result);
    const total = rows.length > 0 ? Number(rows[0]?.total_count ?? 0) : args.offset;
    return {
      data: rows.map(mapProjectReadRow),
      total,
      hasMore: total > args.offset + rows.length,
    };
  }

  async function listProjectsPage(args: {
    brandId?: string | null;
    search?: string | null;
    limit: number;
    offset: number;
  } = { limit: 50, offset: 0 }): Promise<{
    data: PlannerDirectoryProjectRow[];
    total: number;
    hasMore: boolean;
  }> {
    const params: unknown[] = [];
    const whereClauses: string[] = [];

    if (args.brandId) {
      params.push(args.brandId);
      whereClauses.push(`p.brand_id = ${dialect === "postgresql" ? `$${params.length}` : "?"}`);
    }

    const searchClause = buildLikeSearchClause(["p.name", "b.name", "b.company_name"], args.search, dialect, params);
    if (searchClause) whereClauses.push(searchClause);

    params.push(args.limit);
    const limitPlaceholder = dialect === "postgresql" ? `$${params.length}` : "?";
    params.push(args.offset);
    const offsetPlaceholder = dialect === "postgresql" ? `$${params.length}` : "?";

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // Archived projects intentionally remain visible (no archived_at filter).
    const result = await db.query(
      `
        SELECT p.*, b.name AS brand_name, b.company_name AS brand_company_name,
               COUNT(*) OVER() AS total_count
        FROM planner_projects p
        LEFT JOIN planner_brands b ON b.brand_id = p.brand_id
        ${whereSql}
        ORDER BY p.name ASC, p.project_key ASC
        LIMIT ${limitPlaceholder}
        OFFSET ${offsetPlaceholder}
      `,
      params
    );

    const rows = readRows<DbRow>(result);
    const total = rows.length > 0 ? Number(rows[0]?.total_count ?? 0) : args.offset;
    return {
      data: rows.map(mapProjectReadRow),
      total,
      hasMore: total > args.offset + rows.length,
    };
  }

  async function listBrandsByIds(brandIds: string[]): Promise<PlannerDirectoryBrandRow[]> {
    if (brandIds.length === 0) {
      return [];
    }

    const params: unknown[] = [];
    const clause = buildInClause("brand_id", brandIds, dialect, params);
    const result = await db.query(
      `SELECT * FROM planner_brands WHERE ${clause} ORDER BY name ASC`,
      params
    );

    return readRows<DbRow>(result).map(mapBrandReadRow);
  }

  return {
    upsertDepartments,
    upsertBrands,
    upsertProjects,
    upsertEmployees,
    markMissingAsArchived,
    archiveBrandBySourceUuid,
    archiveProjectBySource,
    createSyncRun,
    updateSyncRun,
    addSyncIssue,
    getSyncRunById,
    getLatestSuccessfulSync,
    getLatestInFlightSync,
    listDepartments,
    listDepartmentsForFilterOptions,
    listBrands,
    listBrandsForFilterOptions,
    listProjects,
    listEmployees,
    listEmployeesForBootstrap,
    listTimelineEmployees,
    listProjectsForBootstrap,
    getProjectForFilterOption,
    listProjectsForFilterOptions,
    listProjectsPage,
    listBrandsByIds,
  };
}

export const plannerDirectoryRepository = createPlannerDirectoryRepository();
