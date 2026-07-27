import { describe, expect, it, vi } from "vitest";
import { createPlannerDirectoryRepository } from "@/lib/planner-directory/repository";

/**
 * Wiring-level coverage for the directory read cache. TTL expiry semantics live in
 * lib/planner-directory/directory-cache.test.ts, where the clock is injectable —
 * here we only assert that the repository consults, invalidates, and bypasses it.
 */

function createCountingDb() {
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith("SELECT * FROM planner_brands")) return [[{ brand_id: "b1", name: "Acme" }]];
    if (sql.startsWith("SELECT * FROM planner_projects")) {
      return [[{ project_key: "campaign:1", name: "Launch" }]];
    }
    if (sql.startsWith("SELECT * FROM planner_employees")) {
      return [[{ employee_uuid: "e1", full_name: "Ada" }]];
    }
    return [[]];
  });
  const selectCount = (table: string) =>
    query.mock.calls.filter(([sql]) => String(sql).startsWith(`SELECT * FROM ${table}`)).length;
  return { db: { query }, query, selectCount };
}

describe("planner directory read cache — repository wiring", () => {
  it("serves a repeated listProjects from cache instead of re-scanning the table", async () => {
    const { db, selectCount } = createCountingDb();
    const repository = createPlannerDirectoryRepository({ db });

    const first = await repository.listProjects();
    const second = await repository.listProjects();

    expect(first).toEqual(second);
    expect(selectCount("planner_projects")).toBe(1);
  });

  it("caches all three full-table reads independently", async () => {
    const { db, selectCount } = createCountingDb();
    const repository = createPlannerDirectoryRepository({ db });

    await Promise.all([repository.listBrands(), repository.listProjects(), repository.listEmployees()]);
    await Promise.all([repository.listBrands(), repository.listProjects(), repository.listEmployees()]);

    expect(selectCount("planner_brands")).toBe(1);
    expect(selectCount("planner_projects")).toBe(1);
    expect(selectCount("planner_employees")).toBe(1);
  });

  it("gives each repository instance its own cache", async () => {
    const { db, selectCount } = createCountingDb();
    const first = createPlannerDirectoryRepository({ db });
    const second = createPlannerDirectoryRepository({ db });

    await first.listProjects();
    await second.listProjects();

    // Sharing a cache across instances would leak one test's rows into another.
    expect(selectCount("planner_projects")).toBe(2);
  });

  it("bypasses the cache when asked, without poisoning it", async () => {
    const { db, selectCount } = createCountingDb();
    const repository = createPlannerDirectoryRepository({ db });

    await repository.listProjects({ bypassCache: true });
    await repository.listProjects({ bypassCache: true });

    expect(selectCount("planner_projects")).toBe(2);
  });

  describe("writes invalidate the entity they touched", () => {
    it("upsertProjects invalidates projects but leaves brands cached", async () => {
      const { db, selectCount } = createCountingDb();
      const repository = createPlannerDirectoryRepository({ db });

      await repository.listProjects();
      await repository.listBrands();
      await repository.upsertProjects([
        { projectKey: "campaign:1", name: "Launch", brandId: "b1", sourceType: "campaign" },
      ] as never);
      await repository.listProjects();
      await repository.listBrands();

      expect(selectCount("planner_projects")).toBe(2);
      expect(selectCount("planner_brands")).toBe(1);
    });

    it("upsertBrands invalidates brands", async () => {
      const { db, selectCount } = createCountingDb();
      const repository = createPlannerDirectoryRepository({ db });

      await repository.listBrands();
      await repository.upsertBrands([{ brandId: "b1", name: "Acme" }] as never);
      await repository.listBrands();

      expect(selectCount("planner_brands")).toBe(2);
    });

    it("upsertEmployees invalidates employees", async () => {
      const { db, selectCount } = createCountingDb();
      const repository = createPlannerDirectoryRepository({ db });

      await repository.listEmployees();
      await repository.upsertEmployees([{ employeeUuid: "e1", fullName: "Ada" }] as never);
      await repository.listEmployees();

      expect(selectCount("planner_employees")).toBe(2);
    });

    it("archiving invalidates the archived entity", async () => {
      const { db, selectCount } = createCountingDb();
      const repository = createPlannerDirectoryRepository({ db });

      await repository.listProjects();
      await repository.markMissingAsArchived({
        entity: "project",
        seenIds: ["campaign:1"],
        archivedAt: "2026-07-21T00:00:00.000Z",
      });
      await repository.listProjects();

      expect(selectCount("planner_projects")).toBe(2);
    });

    it("a skipped archive does not needlessly invalidate", async () => {
      const { db, selectCount } = createCountingDb();
      const repository = createPlannerDirectoryRepository({ db });

      await repository.listProjects();
      // archive-guard refuses an empty seenIds set, so no write happens.
      const archived = await repository.markMissingAsArchived({ entity: "project", seenIds: [] });
      await repository.listProjects();

      expect(archived).toBe(0);
      expect(selectCount("planner_projects")).toBe(1);
    });
  });
});
