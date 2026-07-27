import { describe, expect, it, vi } from "vitest";
import { requestPlannerDirectoryRepair } from "@/lib/planner-directory/repair";

describe("planner directory repair", () => {
  it("queues a targeted repair for a missing project reference", async () => {
    const repository = {
      createSyncRun: vi.fn(async () => ({
        syncRunId: "sync-1",
        syncMode: "targeted_repair",
        status: "queued",
        startedAt: "2026-06-05T00:00:00.000Z",
        finishedAt: null,
        triggeredBy: "emp-1",
        triggerSource: "bootstrap",
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
        metadata: null,
      })),
      updateSyncRun: vi.fn(async (_syncRunId, updates) => ({
        syncRunId: "sync-1",
        syncMode: "targeted_repair",
        status: updates.status ?? "queued",
        startedAt: "2026-06-05T00:00:00.000Z",
        finishedAt: updates.finishedAt ?? null,
        triggeredBy: "emp-1",
        triggerSource: "bootstrap",
        employeesSeen: updates.employeesSeen ?? 0,
        employeesUpserted: updates.employeesUpserted ?? 0,
        departmentsSeen: updates.departmentsSeen ?? 0,
        departmentsUpserted: updates.departmentsUpserted ?? 0,
        brandsSeen: updates.brandsSeen ?? 0,
        brandsUpserted: updates.brandsUpserted ?? 0,
        projectsSeen: updates.projectsSeen ?? 0,
        projectsUpserted: updates.projectsUpserted ?? 0,
        recordsArchived: updates.recordsArchived ?? 0,
        issueCount: updates.issueCount ?? 0,
        errorMessage: updates.errorMessage ?? null,
        metadata: updates.metadata ?? null,
      })),
      upsertProjects: vi.fn(async (rows) => rows.length),
    };
    const source = {
      fetchDepartments: vi.fn(async () => ({ records: [] })),
      fetchBrands: vi.fn(async () => ({ records: [] })),
      fetchCampaigns: vi.fn(async () => ({ records: [] })),
      fetchPitches: vi.fn(async () => ({ records: [] })),
      fetchEmployees: vi.fn(async () => ({ records: [] })),
      fetchDepartmentById: vi.fn(async () => null),
      fetchBrandById: vi.fn(async () => null),
      fetchCampaignByUuid: vi.fn(async () => ({
        uuid: "project-1",
        campaign_name: "Project One",
        brand_id: 9,
        company_id: 1,
        currency: "IDR",
        budget: 100,
        asf: 0,
        grand_total: 100,
        start_date: "2026-01-01",
        end_date: "2026-01-31",
        notes: "",
        io_file: "",
        state: "active",
        flag: "active",
        quotation_reference: "",
        created_at: "2026-06-05T00:00:00.000Z",
        updated_at: "2026-06-05T00:00:00.000Z",
      })),
      fetchPitchByUuid: vi.fn(async () => null),
      fetchEmployeeByUuid: vi.fn(async () => null),
    };

    const result = await requestPlannerDirectoryRepair(
      {
        session: {
          access_token: "token",
          user: { id: 1, email: "a@example.com" },
          employee: {
            id: 1,
            uuid: "emp-1",
            nik: "1001",
            full_name: "Ada Lovelace",
            nickname: "Ada",
            position: "Planner",
            dept_id: 1,
            department_name: "Creative",
            photo: "",
          },
          access: {
            level: "full",
            can_view_all: true,
            can_view_own_only: false,
          },
        },
        entityType: "project",
        sourceId: "project-1",
        triggerSource: "bootstrap",
      },
      {
        repository: repository as never,
        source: source as never,
        now: () => "2026-06-05T00:00:00.000Z",
      }
    );

    expect(result.status).toBe("succeeded");
    expect(repository.upsertProjects).toHaveBeenCalled();
  });
});
