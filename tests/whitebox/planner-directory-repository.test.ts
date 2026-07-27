import { describe, expect, it, vi } from "vitest";
import { createPlannerDirectoryRepository } from "@/lib/planner-directory/repository";

function createMockDb() {
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith("SELECT * FROM planner_directory_sync_runs WHERE sync_run_id")) {
      return [
        [
          {
            sync_run_id: "run-1",
            sync_mode: "full_backfill",
            status: "queued",
            started_at: "2026-06-05T00:00:00.000Z",
            finished_at: null,
            employees_seen: 0,
            employees_upserted: 0,
            departments_seen: 0,
            departments_upserted: 0,
            brands_seen: 0,
            brands_upserted: 0,
            projects_seen: 0,
            projects_upserted: 0,
            records_archived: 0,
            issue_count: 0,
            error_message: null,
            metadata: null,
          },
        ],
      ];
    }

    return [[]];
  });

  return { query };
}

describe("planner directory repository", () => {
  it("creates queued sync runs", async () => {
    const db = createMockDb();
    const repository = createPlannerDirectoryRepository({
      db,
      now: () => "2026-06-05T00:00:00.000Z",
      syncRunIdFactory: () => "run-1",
      issueIdFactory: () => "issue-1",
    });

    const created = await repository.createSyncRun({
      syncMode: "full_backfill",
      triggerSource: "manual",
      triggeredBy: "employee-1",
      metadata: { source: "manual" },
    });

    expect(created.syncRunId).toBe("run-1");
    expect(created.status).toBe("queued");
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO planner_directory_sync_runs"),
      expect.arrayContaining(["run-1", "full_backfill", "queued"])
    );
  });

  it("upserts directory rows instead of duplicating them", async () => {
    const db = createMockDb();
    const repository = createPlannerDirectoryRepository({
      db,
      now: () => "2026-06-05T00:00:00.000Z",
      syncRunIdFactory: () => "run-1",
      issueIdFactory: () => "issue-1",
    });

    await repository.upsertEmployees([
      {
        employeeUuid: "emp-1",
        sourceEmployeeId: "1001",
        employeeNumber: "1001",
        nik: "1001",
        fullName: "Ada Lovelace",
        nickname: "Ada",
        email: null,
        photo: null,
        position: "Planner",
        departmentId: "7",
        weeklyCapacity: 40,
        employmentStatus: "active",
        visibility: "active",
        workStartDate: "2026-01-01",
        sourceUpdatedAt: "2026-01-02T00:00:00Z",
        sourceHash: "hash-1",
        syncedAt: "2026-06-05T00:00:00.000Z",
        lastSeenAt: "2026-06-05T00:00:00.000Z",
        archivedAt: null,
      },
    ]);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO planner_employees"),
      expect.arrayContaining(["emp-1", "Ada Lovelace"])
    );
    expect(String(db.query.mock.calls[0]?.[0])).toMatch(/ON (CONFLICT|DUPLICATE KEY UPDATE)/);
  });

  it("builds archive and issue queries without deleting missing rows", async () => {
    const db = createMockDb();
    const repository = createPlannerDirectoryRepository({
      db,
      now: () => "2026-06-05T00:00:00.000Z",
      syncRunIdFactory: () => "run-1",
      issueIdFactory: () => "issue-1",
    });

    await repository.markMissingAsArchived({
      entity: "employee",
      seenIds: ["emp-1", "emp-2"],
      archivedAt: "2026-06-05T00:00:00.000Z",
    });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE planner_employees SET archived_at"),
      expect.arrayContaining(["2026-06-05T00:00:00.000Z", "emp-1", "emp-2"])
    );

    await repository.addSyncIssue({
      syncRunId: "run-1",
      entityType: "employee",
      sourceId: "emp-1",
      severity: "warning",
      message: "Missing source row",
      payload: { source: "repair" },
    });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO planner_directory_sync_issues"),
      expect.arrayContaining(["issue-1", "run-1", "employee", "emp-1", "warning", "Missing source row"])
    );
  });

  it("splits large project upserts into multiple queries", async () => {
    const db = createMockDb();
    const repository = createPlannerDirectoryRepository({
      db,
      now: () => "2026-06-05T00:00:00.000Z",
      syncRunIdFactory: () => "run-1",
      issueIdFactory: () => "issue-1",
    });

    const rows = Array.from({ length: 600 }, (_, index) => ({
      projectKey: `campaign:${index + 1}`,
      sourceProjectId: String(index + 1),
      sourceType: "campaign" as const,
      name: `Campaign ${index + 1}`,
      brandId: "9",
      color: null,
      status: "active",
      startDate: null,
      endDate: null,
      submitDate: null,
      sourceUpdatedAt: "2026-06-05T00:00:00Z",
      sourceHash: `hash-${index + 1}`,
      syncedAt: "2026-06-05T00:00:00Z",
      lastSeenAt: "2026-06-05T00:00:00Z",
      archivedAt: null,
    }));

    await repository.upsertProjects(rows);

    const insertCalls = db.query.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO planner_projects")
    );

    expect(insertCalls.length).toBeGreaterThan(1);
    expect(insertCalls[0]?.[1]).toBeInstanceOf(Array);
    expect((insertCalls[0]?.[1] as unknown[]).length).toBeGreaterThan(0);
  });

  it("writes and reads planner project submit dates", async () => {
    const db = createMockDb();
    db.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM planner_projects")) {
        return [
          [
            {
              project_key: "pitch:pitch-1",
              source_project_id: "pitch-1",
              source_type: "pitch",
              name: "Pitch Work",
              brand_id: "9",
              color: null,
              status: "planning",
              start_date: null,
              end_date: null,
              submit_date: "2026-06-12",
              source_updated_at: "2026-06-05T00:00:00Z",
              source_hash: "hash-1",
              synced_at: "2026-06-05T00:00:00Z",
              last_seen_at: "2026-06-05T00:00:00Z",
              archived_at: null,
            },
          ],
        ];
      }

      return [[]];
    });
    const repository = createPlannerDirectoryRepository({ db });

    await repository.upsertProjects([
      {
        projectKey: "pitch:pitch-1",
        sourceProjectId: "pitch-1",
        sourceType: "pitch",
        name: "Pitch Work",
        brandId: "9",
        color: null,
        status: "planning",
        startDate: null,
        endDate: null,
        submitDate: "2026-06-12",
        sourceUpdatedAt: "2026-06-05T00:00:00Z",
        sourceHash: "hash-1",
        syncedAt: "2026-06-05T00:00:00Z",
        lastSeenAt: "2026-06-05T00:00:00Z",
        archivedAt: null,
      },
    ]);
    const projects = await repository.listProjects();

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO planner_projects"),
      expect.arrayContaining(["2026-06-12"])
    );
    expect(projects[0]).toMatchObject({
      projectKey: "pitch:pitch-1",
      submitDate: "2026-06-12",
    });
  });

  it("queries a paginated employee bootstrap slice from the local directory", async () => {
    const db = createMockDb();
    const repository = createPlannerDirectoryRepository({ db });

    await repository.listEmployeesForBootstrap({
      offset: 0,
      limit: 24,
      search: "ada",
    });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM planner_employees"),
      expect.arrayContaining(["%ada%", 24, 0])
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("LEFT JOIN planner_departments"),
      expect.any(Array)
    );
  });

  it("scopes the employee bootstrap slice to project assignments when brand/project filters are active", async () => {
    const db = createMockDb();
    const repository = createPlannerDirectoryRepository({ db });

    await repository.listEmployeesForBootstrap({
      offset: 0,
      limit: 60,
      assignmentProjectIds: ["proj-1", "proj-2"],
      assignmentRange: { startDate: "2026-04-01", endDate: "2026-06-30" },
    });

    const [sql, params] = db.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("EXISTS (SELECT 1 FROM assignments x WHERE x.employee_uuid = e.employee_uuid");
    expect(sql).toContain("EXISTS (SELECT 1 FROM actual x WHERE x.employee_uuid = e.employee_uuid");
    expect(sql).toContain("COALESCE(x.is_time_off, 0) = 0");
    expect(sql).toContain("e.employment_status = 'active'");
    // params in textual order: active filter (range), plan EXISTS (ids, range),
    // actual EXISTS (ids, range), then LIMIT/OFFSET — positional placeholders
    // bind by position. The active-employee filter composes with the brand
    // scope, so its range params lead.
    expect(params).toEqual([
      "2026-04-01", "2026-06-30",
      "proj-1", "proj-2", "2026-04-01", "2026-06-30",
      "proj-1", "proj-2", "2026-04-01", "2026-06-30",
      60, 0,
    ]);
  });

  it("shows only active employees, resurfacing inactive ones with planned work in the visible range", async () => {
    const db = createMockDb();
    const repository = createPlannerDirectoryRepository({ db });

    await repository.listEmployeesForBootstrap({
      offset: 0,
      limit: 60,
      assignmentRange: { startDate: "2026-01-01", endDate: "2026-12-31" },
    });

    const [sql, params] = db.query.mock.calls[0] as unknown as [string, unknown[]];
    // Active employees always show; an inactive employee surfaces only via a
    // planned (non-time-off) assignment overlapping the range — no actual,
    // no project scoping.
    expect(sql).toContain(
      "(e.employment_status = 'active' OR EXISTS (SELECT 1 FROM assignments x WHERE x.employee_uuid = e.employee_uuid AND x.end_date >="
    );
    expect(sql).not.toContain("FROM actual x");
    expect(sql).toContain("COALESCE(x.is_time_off, 0) = 0");
    // Only the active filter's range params precede LIMIT/OFFSET.
    expect(params).toEqual(["2026-01-01", "2026-12-31", 60, 0]);
  });

  it("does not apply the active-employee filter to the self-scoped fetch", async () => {
    const db = createMockDb();
    const repository = createPlannerDirectoryRepository({ db });

    await repository.listEmployeesForBootstrap({
      offset: 0,
      limit: 1,
      employeeUuid: "emp-self",
      assignmentRange: { startDate: "2026-04-01", endDate: "2026-06-30" },
    });

    const [sql, params] = db.query.mock.calls[0] as unknown as [string, unknown[]];
    // A user always sees their own row regardless of status — no active filter.
    expect(sql).not.toContain("e.employment_status = 'active'");
    expect(params).toEqual(["emp-self", 1, 0]);
  });

  it("queries local projects and brands for bootstrap without touching Timetrack", async () => {
    const db = createMockDb();
    const repository = createPlannerDirectoryRepository({ db });

    await repository.listProjectsForBootstrap({
      brandId: "brand-9",
      search: "launch",
      referencedProjectIds: ["campaign-1", "pitch-2"],
    });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM planner_projects"),
      expect.arrayContaining(["brand-9", "%launch%", "campaign-1", "pitch-2"])
    );

    await repository.listBrandsByIds(["brand-9", "brand-10"]);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM planner_brands"),
      expect.arrayContaining(["brand-9", "brand-10"])
    );
  });

  it("OR-combines brand scope with referenced projects so both sets appear", async () => {
    let capturedSql = "";
    let capturedParams: unknown[] = [];
    const db = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        capturedSql = sql;
        capturedParams = params;
        return [[]];
      }),
    };
    const repository = createPlannerDirectoryRepository({ db });

    await repository.listProjectsForBootstrap({
      brandId: "brand-1",
      referencedProjectIds: ["proj-x"],
    });

    // The WHERE clause must use OR between the brand scope and the referenced-
    // projects IN clause — not AND — so an employee's other-brand campaigns
    // are never dropped when a brand filter is active.
    expect(capturedSql).toContain(" OR ");
    expect(capturedSql).toContain("p.brand_id");
    expect(capturedSql).toContain("source_project_id");
    // Both values must be bound as params.
    expect(capturedParams).toContain("brand-1");
    expect(capturedParams).toContain("proj-x");
  });

  it("includes referenced projects even when they fall outside the brand scope", async () => {
    let capturedSql = "";
    const db = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        capturedSql = sql;
        return [[]];
      }),
    };
    const repository = createPlannerDirectoryRepository({ db });

    await repository.listProjectsForBootstrap({
      brandId: "brand-1",
      referencedProjectIds: ["proj-x"],
    });

    // The brand condition and the referenced IN clause must be separated by OR,
    // not AND. If they were AND-ed inside a single parenthesised group the
    // referenced projects would only surface when they also match the brand —
    // which defeats the whole purpose. We confirm OR appears between them by
    // checking that the SQL has OR between the brand clause and the
    // source_project_id IN clause (they share the same combined condition block).
    const brandPos = capturedSql.indexOf("p.brand_id");
    const refPos = capturedSql.indexOf("source_project_id");
    const orPos = capturedSql.indexOf(" OR ");
    // Both conditions exist and OR appears somewhere between them.
    expect(brandPos).toBeGreaterThan(-1);
    expect(refPos).toBeGreaterThan(-1);
    expect(orPos).toBeGreaterThan(-1);
    // OR must sit between the brand placeholder and the referenced IN clause.
    expect(orPos).toBeGreaterThan(brandPos);
    expect(orPos).toBeLessThan(refPos);
  });

  it("queries a paginated, searchable brand slice for filter options", async () => {
    const db = createMockDb();
    const repository = createPlannerDirectoryRepository({ db });

    await repository.listBrandsForFilterOptions({ search: "acme", limit: 50, offset: 0 });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("COUNT(*) OVER() AS total_count"),
      expect.arrayContaining(["%acme%", 50, 0])
    );
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("LIMIT"), expect.any(Array));
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("OFFSET"), expect.any(Array));
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY name ASC"),
      expect.any(Array)
    );
  });

  it("derives total and hasMore for the brand slice from the window count", async () => {
    const db = {
      query: vi.fn(async () => [[
        { brand_id: "b1", name: "Acme", company_name: "Acme Inc", status: "active", total_count: "120" },
      ]]),
    };
    const repository = createPlannerDirectoryRepository({ db });

    const result = await repository.listBrandsForFilterOptions({ limit: 50, offset: 0 });
    expect(result.total).toBe(120);
    expect(result.hasMore).toBe(true);
    expect(result.data).toHaveLength(1);
  });

  it("queries all non-archived departments for filter options", async () => {
    const db = createMockDb();
    const repository = createPlannerDirectoryRepository({ db });

    await repository.listDepartmentsForFilterOptions();

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM planner_departments"),
      []
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("archived_at IS NULL"),
      []
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY name ASC"),
      []
    );
  });

  it("queries a paginated, searchable, scoped project slice for filter options", async () => {
    let capturedSql = "";
    let capturedParams: unknown[] = [];
    const db = { query: async (sql: string, params: unknown[]) => { capturedSql = sql; capturedParams = params; return { rows: [] }; } };
    const repository = createPlannerDirectoryRepository({ db });

    await repository.listProjectsForFilterOptions({
      brandIds: ["brand-9"], status: "active", sourceType: "campaign",
      search: "launch", limit: 50, offset: 0,
    });

    expect(capturedSql).toContain("COUNT(*) OVER() AS total_count");
    expect(capturedParams).toContain("brand-9");
    expect(capturedParams).toContain("active");
    expect(capturedParams).toContain("campaign");
    expect(capturedParams).toContain("%launch%");
    expect(capturedParams).toContain(50);
    expect(capturedParams).toContain(0);
    expect(capturedSql).toContain("p.brand_id IN");
    expect(capturedSql).toContain("LEFT JOIN planner_brands");
    expect(capturedSql).toContain("b.name AS brand_name");
    expect(capturedSql).toContain("LIMIT");
    expect(capturedSql).toContain("p.archived_at IS NULL");
  });

  it("queries a selected project for filter option preservation", async () => {
    const db = createMockDb();
    const repository = createPlannerDirectoryRepository({ db });

    await repository.getProjectForFilterOption("campaign-123");

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("p.source_project_id"),
      expect.arrayContaining(["campaign-123"])
    );
  });

  it("filters filter-option projects by an IN list of brand ids", async () => {
    let capturedSql = "";
    let capturedParams: unknown[] = [];
    const repo = createPlannerDirectoryRepository({
      db: { query: async (sql: string, params: unknown[]) => { capturedSql = sql; capturedParams = params; return { rows: [] }; } },
    });
    await repo.listProjectsForFilterOptions({ brandIds: ["b1", "b2"], limit: 50, offset: 0 });
    expect(capturedSql).toContain("p.brand_id IN");
    expect(capturedParams).toContain("b1");
    expect(capturedParams).toContain("b2");
  });

  it("archives a single brand by its source uuid without deleting the row", async () => {
    const db = createMockDb();
    const repository = createPlannerDirectoryRepository({ db });

    await repository.archiveBrandBySourceUuid("brand-uuid-1", "2026-07-13T10:00:00.000Z");

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE planner_brands SET archived_at"),
      ["2026-07-13T10:00:00.000Z", "brand-uuid-1"]
    );
    expect(String(db.query.mock.calls[0]?.[0])).toContain("WHERE source_uuid");
    expect(String(db.query.mock.calls[0]?.[0])).not.toMatch(/DELETE/i);
  });

  it("archives a single project by its source type and uuid without deleting the row", async () => {
    const db = createMockDb();
    const repository = createPlannerDirectoryRepository({ db });

    await repository.archiveProjectBySource("pitch", "pitch-uuid-1", "2026-07-13T10:00:00.000Z");

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE planner_projects SET archived_at"),
      ["2026-07-13T10:00:00.000Z", "pitch", "pitch-uuid-1"]
    );
    const sql = String(db.query.mock.calls[0]?.[0]);
    expect(sql).toContain("WHERE source_type");
    expect(sql).toContain("source_project_id");
    expect(sql).not.toMatch(/DELETE/i);
  });
});
