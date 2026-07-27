import { describe, expect, it, vi } from "vitest";
import { runPlannerDirectorySync } from "@/lib/planner-directory/sync-engine";

function createRepository() {
  const state = {
    departments: [
      {
        departmentId: "1",
        sourceDepartmentId: "1",
        name: "Creative",
        code: "CR",
        color: "#111111",
        isActive: true,
        sourceUpdatedAt: "2026-01-01T00:00:00Z",
        sourceHash: "dept-old",
        syncedAt: "2026-01-01T00:00:00Z",
        lastSeenAt: "2026-01-01T00:00:00Z",
        archivedAt: null,
      },
    ],
    brands: [
      {
        brandId: "9",
        sourceBrandId: "9",
        sourceUuid: "brand-9",
        name: "Acme",
        companyName: "Acme Ltd",
        color: "#222222",
        status: "active",
        sourceUpdatedAt: "2026-01-01T00:00:00Z",
        sourceHash: "brand-old",
        syncedAt: "2026-01-01T00:00:00Z",
        lastSeenAt: "2026-01-01T00:00:00Z",
        archivedAt: null,
      },
    ],
    projects: [
      {
        projectKey: "campaign:campaign-1",
        sourceProjectId: "campaign-1",
        sourceType: "campaign",
        name: "Campaign One",
        brandId: "9",
        color: "#333333",
        status: "active",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        submitDate: null,
        sourceUpdatedAt: "2026-01-01T00:00:00Z",
        sourceHash: "project-old",
        syncedAt: "2026-01-01T00:00:00Z",
        lastSeenAt: "2026-01-01T00:00:00Z",
        archivedAt: null,
      },
    ],
    employees: [
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
        departmentId: "1",
        weeklyCapacity: 40,
        employmentStatus: "active",
        visibility: "active",
        workStartDate: "2026-01-01",
        sourceUpdatedAt: "2026-01-01T00:00:00Z",
        sourceHash: "emp-old",
        syncedAt: "2026-01-01T00:00:00Z",
        lastSeenAt: "2026-01-01T00:00:00Z",
        archivedAt: null,
      },
    ],
  };

  const repository = {
    createSyncRun: vi.fn(async (input) => ({
      syncRunId: "sync-1",
      syncMode: input.syncMode,
      status: "queued",
      startedAt: "2026-06-05T00:00:00.000Z",
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
    })),
    updateSyncRun: vi.fn(async (_syncRunId, updates) => ({
      syncRunId: "sync-1",
      syncMode: "full_backfill",
      status: updates.status ?? "queued",
      startedAt: "2026-06-05T00:00:00.000Z",
      finishedAt: updates.finishedAt ?? null,
      triggeredBy: null,
      triggerSource: "manual",
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
    listDepartments: vi.fn(async () => state.departments),
    listBrands: vi.fn(async () => state.brands),
    listProjects: vi.fn(async () => state.projects),
    listEmployees: vi.fn(async () => state.employees),
    upsertDepartments: vi.fn(async (rows) => rows.length),
    upsertBrands: vi.fn(async (rows) => rows.length),
    upsertProjects: vi.fn(async (rows) => rows.length),
    upsertEmployees: vi.fn(async (rows) => rows.length),
    markMissingAsArchived: vi.fn(async ({ seenIds }) => seenIds.length),
    addSyncIssue: vi.fn(async () => null),
  };

  return { repository, state };
}

function createSource() {
  return {
    fetchDepartments: vi.fn(async () => ({
      records: [
        {
          id: 1,
          department_name: "Creative",
          code: "CR",
          color: "#111111",
          is_active: true,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-06-05T00:00:00Z",
          flag: "active",
        },
      ],
    })),
    fetchBrands: vi.fn(async () => ({
      records: [
        {
          id: 9,
          uuid: "brand-9",
          company_name: "Acme Ltd",
          client_code: "C9",
          brand_name: "Acme",
          brand_address: "",
          pic_brand_name: "",
          pic_email: "",
          brand_website: "",
          pic_title: "",
          pic_brand_phone: "",
          pic_finance_name: "",
          pic_finance_phone: null,
          industry_category: "",
          description: "",
          logo: "",
          flag: "active",
          tax_account: "",
          top: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-06-05T00:00:00Z",
        },
      ],
    })),
    fetchCampaigns: vi.fn(async () => ({
      records: [
        {
          uuid: "campaign-1",
          campaign_name: "Campaign One",
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
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-06-05T00:00:00Z",
        },
      ],
    })),
    fetchPitches: vi.fn(async () => ({ records: [] })),
    fetchEmployees: vi.fn(async () => ({
      records: [
        {
          uuid: "emp-1",
          nik: "1001",
          full_name: "Ada Lovelace",
          nickname: "Ada",
          position: "Planner",
          dept_id: 1,
          direct_supervisor: 0,
          gender: "FEMALE",
          group_timeoff_category: 0,
          work_start_date: "2026-01-01",
          dob: "1990-01-01",
          photo: null,
          flag: "active",
          status: "visible",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-06-05T00:00:00Z",
        },
      ],
    })),
    fetchDepartmentById: vi.fn(async () => null),
    fetchBrandById: vi.fn(async () => null),
    fetchCampaignByUuid: vi.fn(async () => null),
    fetchPitchByUuid: vi.fn(async () => null),
    fetchEmployeeByUuid: vi.fn(async () => null),
  };
}

function createLargeSource() {
  const departments = Array.from({ length: 11 }, (_, index) => ({
    id: index + 1,
    department_name: `Department ${index + 1}`,
    code: `D${index + 1}`,
    color: "#111111",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-06-05T00:00:00Z",
    flag: "active",
  }));

  const brands = Array.from({ length: 548 }, (_, index) => ({
    id: index + 1,
    brand_id: index + 1,
    uuid: `brand-${index + 1}`,
    company_name: `Company ${index + 1}`,
    client_code: index + 1,
    brand_name: `Brand ${index + 1}`,
    brand_address: "Address",
    pic_brand_name: "PIC",
    pic_email: "pic@example.com",
    brand_website: "-",
    pic_title: "Title",
    pic_brand_phone: "08123456789",
    pic_finance_name: "",
    pic_finance_phone: null,
    industry_category: "",
    description: "",
    logo: "",
    flag: "active",
    tax_account: "",
    top: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-06-05T00:00:00Z",
  }));

  const campaigns = Array.from({ length: 4476 }, (_, index) => ({
    uuid: `campaign-${index + 1}`,
    campaign_name: `Campaign ${index + 1}`,
    brand_id: (index % 548) + 1,
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
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-06-05T00:00:00Z",
  }));

  const pitches = Array.from({ length: 781 }, (_, index) => ({
    uuid: `pitch-${index + 1}`,
    pitch_name: `Pitch ${index + 1}`,
    brand_id: (index % 548) + 1,
    region: null,
    date_submit: null,
    status: "win",
    budget: 100,
    value_total: 100,
    currency: "IDR",
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-06-05T00:00:00Z",
  }));

  const employees = Array.from({ length: 292 }, (_, index) => ({
    uuid: `employee-${index + 1}`,
    nik: `NIK-${index + 1}`,
    full_name: `Employee ${index + 1}`,
    nickname: `Emp ${index + 1}`,
    position: "Planner",
    dept_id: (index % 11) + 1,
    direct_supervisor: 0,
    gender: "FEMALE",
    group_timeoff_category: 0,
    work_start_date: "2026-01-01",
    dob: "1990-01-01",
    photo: null,
    flag: "active",
    status: "visible",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-06-05T00:00:00Z",
  }));

  return {
    fetchDepartments: vi.fn(async () => ({ records: departments })),
    fetchBrands: vi.fn(async () => ({ records: brands })),
    fetchCampaigns: vi.fn(async () => ({ records: campaigns })),
    fetchPitches: vi.fn(async () => ({ records: pitches })),
    fetchEmployees: vi.fn(async () => ({ records: employees })),
    fetchDepartmentById: vi.fn(async () => null),
    fetchBrandById: vi.fn(async () => null),
    fetchCampaignByUuid: vi.fn(async () => null),
    fetchPitchByUuid: vi.fn(async () => null),
    fetchEmployeeByUuid: vi.fn(async () => null),
  };
}

describe("planner directory sync engine", () => {
  it("returns a successful run summary for a full backfill", async () => {
    const { repository } = createRepository();
    const source = createSource();

    const result = await runPlannerDirectorySync(
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
        syncMode: "full_backfill",
        triggerSource: "manual",
      },
      { repository: repository as never, source: source as never, now: () => "2026-06-05T00:00:00.000Z" }
    );

    expect(result.status).toBe("succeeded");
    expect(repository.upsertEmployees).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ employeeUuid: "emp-1" })]));
    expect(repository.markMissingAsArchived).toHaveBeenCalled();
  });

  it("only updates changed rows during incremental refresh", async () => {
    const { repository } = createRepository();
    const source = createSource();

    const result = await runPlannerDirectorySync(
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
        syncMode: "incremental_refresh",
        triggerSource: "schedule",
      },
      { repository: repository as never, source: source as never, now: () => "2026-06-05T00:00:00.000Z" }
    );

    expect(result.status).toBe("succeeded");
    expect(repository.upsertEmployees).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ employeeUuid: "emp-1" })]));
    expect(repository.listEmployees).toHaveBeenCalled();
  });

  it("reads existing rows past the cache so the changed-row diff can't go stale", async () => {
    const { repository } = createRepository();
    const source = createSource();

    await runPlannerDirectorySync(
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
          access: { level: "full", can_view_all: true, can_view_own_only: false },
        },
        syncMode: "incremental_refresh",
        triggerSource: "schedule",
      },
      { repository: repository as never, source: source as never, now: () => "2026-06-05T00:00:00.000Z" }
    );

    // These three feed filterChanged*, which decides what gets upserted. A cached
    // snapshot here would make a changed row look unchanged and skip its update.
    for (const read of [repository.listBrands, repository.listProjects, repository.listEmployees]) {
      expect(read).toHaveBeenCalledWith({ bypassCache: true });
    }
  });

  it("handles Timetrack-scale backfill volumes", async () => {
    const { repository } = createRepository();
    const source = createLargeSource();

    const result = await runPlannerDirectorySync(
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
        syncMode: "full_backfill",
        triggerSource: "admin_route",
      },
      { repository: repository as never, source: source as never, now: () => "2026-06-05T00:00:00.000Z" }
    );

    expect(result.status).toBe("succeeded");
    expect(result.departmentsSeen).toBe(11);
    expect(result.brandsSeen).toBe(548);
    expect(result.projectsSeen).toBe(5257);
    expect(result.employeesSeen).toBe(292);
  });
});
