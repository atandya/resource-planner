import { createMySqlApiClient } from "@/lib/mysql/api-client";
import { createTimeTrackRequestPacer } from "@/lib/planner-directory/timetrack-request-pacer";
import type { SessionData } from "@/lib/auth/session";
import type { MySqlApiResponse } from "@/lib/types/mysql";
import type {
  MySqlBrand,
  MySqlCampaign,
  MySqlEmployee,
  MySqlPitch,
} from "@/lib/types/mysql";
import type {
  PlannerDirectoryBrandRow,
  PlannerDirectoryDepartmentRow,
  PlannerDirectoryEmployeeRow,
  PlannerDirectoryProjectRow,
  PlannerDirectorySourceType,
} from "@/lib/planner-directory/types";
import { buildPlannerProjectKey } from "@/lib/planner-directory/types";
import type { PlannerDirectoryIssueSeverity } from "@/lib/planner-directory/types";

const DEFAULT_PAGE_SIZE = 100;
const directoryRequestPacer = createTimeTrackRequestPacer({
  minimumIntervalMs: 1_500,
});

type PaginatedSourceResponse<T> = MySqlApiResponse<T[]>;

type SourceFetchResult<T> = {
  records: T[];
  fetchedAt: string;
};

type TimetrackListResponse<T> = {
  status?: number;
  data?: T[] | { data?: T[]; meta?: Record<string, unknown> };
  meta?: Record<string, unknown>;
  success?: boolean;
  message?: string;
  error?: unknown;
};

type TimetrackDepartmentRecord = {
  id?: number | string;
  department_name?: string;
  code?: string | null;
  color?: string | null;
  is_active?: boolean | number | string;
  created_at?: string;
  updated_at?: string;
  flag?: string | null;
};

function createDirectoryApiClient(session: SessionData) {
  return createMySqlApiClient(async () => session.access_token, {
    requestPacer: directoryRequestPacer,
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function nullableString(value: unknown): string | null {
  return value == null || value === "" ? null : asString(value);
}

function hashRecord(record: Record<string, unknown>): string {
  const payload = JSON.stringify(record, Object.keys(record).sort());
  let hash = 0;

  for (let index = 0; index < payload.length; index += 1) {
    hash = (hash * 31 + payload.charCodeAt(index)) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

function normalizeCampaignProjectStatus(flag: unknown): PlannerDirectoryProjectRow["status"] {
  if (flag === "active") {
    return "active";
  }
  if (flag === "inactive") {
    return "completed";
  }
  return "planning";
}

function normalizePitchProjectStatus(status: unknown): PlannerDirectoryProjectRow["status"] {
  if (status === "win") {
    return "completed";
  }
  if (status === "loss") {
    return "cancelled";
  }
  return "planning";
}

async function fetchAllPages<T>(
  sourceName: string,
  fetchPage: (page: number) => Promise<PaginatedSourceResponse<T> | TimetrackListResponse<T>>
): Promise<SourceFetchResult<T>> {
  const records: T[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    console.info(`[Planner Directory Sync] Fetching ${sourceName} page ${page}`);
    const response = await fetchPage(page);

    if ("success" in response && response.success === false) {
      console.error(`[Planner Directory Sync] ${sourceName} fetch failed`, {
        page,
        status: response.status,
        message: response.message,
        error: response.error,
      });
      throw new Error(
        `TimeTrack ${sourceName} fetch failed on page ${page}: ${response.message || "unknown error"}`
      );
    }

    const responseData = response.data as
      | T[]
      | { data?: T[]; meta?: Record<string, unknown> }
      | undefined;
    const pageRecords = Array.isArray(responseData)
      ? responseData
      : Array.isArray(responseData?.data)
        ? responseData.data
        : [];
    const meta = response.meta ?? responseData?.meta;
    console.info(`[Planner Directory Sync] ${sourceName} page ${page} returned ${pageRecords.length} rows`, {
      status: response.status,
      hasMeta: !!meta,
      total: (meta as { total?: number } | undefined)?.total ?? null,
      lastPage: (meta as { last_page?: number } | undefined)?.last_page ?? null,
    });
    records.push(...pageRecords);

    hasMore = meta
      ? (meta as { current_page?: number; last_page?: number }).current_page <
        (meta as { current_page?: number; last_page?: number }).last_page
      : pageRecords.length === DEFAULT_PAGE_SIZE;
    page += 1;
  }

  return {
    records,
    fetchedAt: nowIso(),
  };
}

export async function fetchTimetrackDepartments(session: SessionData): Promise<SourceFetchResult<TimetrackDepartmentRecord>> {
  const client = createDirectoryApiClient(session);

  return fetchAllPages("departments", (page) =>
    client.getDepartments({
      page,
      per_page: DEFAULT_PAGE_SIZE,
    }) as Promise<PaginatedSourceResponse<TimetrackDepartmentRecord>>
  );
}

export async function fetchTimetrackBrands(session: SessionData): Promise<SourceFetchResult<MySqlBrand>> {
  const client = createDirectoryApiClient(session);

  return fetchAllPages("brands", (page) =>
    client.getBrands({
      page,
      per_page: DEFAULT_PAGE_SIZE,
    }) as Promise<PaginatedSourceResponse<MySqlBrand>>
  );
}

export async function fetchTimetrackCampaigns(session: SessionData): Promise<SourceFetchResult<MySqlCampaign>> {
  const client = createDirectoryApiClient(session);

  return fetchAllPages("campaigns", (page) =>
    client.getCampaigns({
      page,
      per_page: DEFAULT_PAGE_SIZE,
    }) as Promise<PaginatedSourceResponse<MySqlCampaign>>
  );
}

export async function fetchTimetrackPitches(session: SessionData): Promise<SourceFetchResult<MySqlPitch>> {
  const client = createDirectoryApiClient(session);

  return fetchAllPages("pitches", (page) =>
    client.getPitches({
      page,
      per_page: DEFAULT_PAGE_SIZE,
    }) as Promise<PaginatedSourceResponse<MySqlPitch>>
  );
}

export async function fetchTimetrackEmployees(session: SessionData): Promise<SourceFetchResult<MySqlEmployee>> {
  const client = createDirectoryApiClient(session);

  return fetchAllPages("employees", (page) =>
    client.getEmployees({
      page,
      per_page: DEFAULT_PAGE_SIZE,
    }) as Promise<PaginatedSourceResponse<MySqlEmployee>>
  );
}

export async function fetchTimetrackDepartmentById(
  session: SessionData,
  sourceDepartmentId: string
): Promise<TimetrackDepartmentRecord | null> {
  const departments = await fetchTimetrackDepartments(session);
  return departments.records.find((record) => nullableString(record.id) === sourceDepartmentId) ?? null;
}

export async function fetchTimetrackBrandById(
  session: SessionData,
  sourceBrandId: string
): Promise<MySqlBrand | null> {
  const client = createDirectoryApiClient(session);
  const response = await client.getBrand(sourceBrandId);
  if (response.error) {
    const brands = await fetchTimetrackBrands(session);
    return brands.records.find((record) => asString(record.id) === sourceBrandId || record.uuid === sourceBrandId) ?? null;
  }
  return response.data ?? null;
}

export async function fetchTimetrackCampaignByUuid(
  session: SessionData,
  sourceProjectId: string
): Promise<MySqlCampaign | null> {
  const client = createDirectoryApiClient(session);
  const response = await client.getCampaign(sourceProjectId);
  return response.error ? null : response.data ?? null;
}

export async function fetchTimetrackPitchByUuid(
  session: SessionData,
  sourceProjectId: string
): Promise<MySqlPitch | null> {
  const client = createDirectoryApiClient(session);
  const response = await client.getPitch(sourceProjectId);
  return response.error ? null : response.data ?? null;
}

export async function fetchTimetrackEmployeeByUuid(
  session: SessionData,
  sourceEmployeeUuid: string
): Promise<MySqlEmployee | null> {
  const client = createDirectoryApiClient(session);
  const response = await client.getEmployee(sourceEmployeeUuid);
  return response.error ? null : response.data ?? null;
}

export function normalizeDepartmentSource(record: TimetrackDepartmentRecord): PlannerDirectoryDepartmentRow | null {
  const sourceDepartmentId = nullableString(record.id);
  if (!sourceDepartmentId) {
    return null;
  }

  const updatedAt = nullableString(record.updated_at);
  const normalized: PlannerDirectoryDepartmentRow = {
    departmentId: sourceDepartmentId,
    sourceDepartmentId,
    name: asString(record.department_name || sourceDepartmentId),
    code: nullableString(record.code),
    color: nullableString(record.color),
    isActive: record.is_active === true || record.is_active === 1 || record.flag === "active",
    sourceUpdatedAt: updatedAt,
    sourceHash: hashRecord({
      id: sourceDepartmentId,
      name: record.department_name ?? null,
      code: record.code ?? null,
      color: record.color ?? null,
      is_active: record.is_active ?? null,
      flag: record.flag ?? null,
      updated_at: updatedAt,
    }),
    syncedAt: nowIso(),
    lastSeenAt: nowIso(),
    archivedAt: null,
  };

  return normalized;
}

export function normalizeBrandSource(record: MySqlBrand): PlannerDirectoryBrandRow | null {
  const sourceBrandId = nullableString(record.brand_id ?? record.id);
  if (!sourceBrandId) {
    return null;
  }

  return {
    brandId: sourceBrandId,
    sourceBrandId,
    sourceUuid: nullableString(record.uuid),
    name: asString(record.brand_name || record.company_name || sourceBrandId),
    companyName: nullableString(record.company_name),
    color: nullableString(record.color),
    status: asString(record.flag || "active"),
    sourceUpdatedAt: nullableString(record.updated_at),
    sourceHash: hashRecord({
      brand_id: sourceBrandId,
      id: record.id ?? null,
      uuid: record.uuid ?? null,
      brand_name: record.brand_name ?? null,
      company_name: record.company_name ?? null,
      color: record.color ?? null,
      flag: record.flag ?? null,
      updated_at: record.updated_at ?? null,
    }),
    syncedAt: nowIso(),
    lastSeenAt: nowIso(),
    archivedAt: null,
  };
}

export function normalizeProjectSource(
  record: MySqlCampaign | MySqlPitch,
  sourceType: PlannerDirectorySourceType
): PlannerDirectoryProjectRow | null {
  const sourceId = sourceType === "campaign" ? nullableString((record as MySqlCampaign).uuid) : nullableString((record as MySqlPitch).uuid);
  if (!sourceId) {
    return null;
  }

  const name = sourceType === "campaign"
    ? asString((record as MySqlCampaign).campaign_name || sourceId)
    : asString((record as MySqlPitch).pitch_name || sourceId);
  const brandIdValue = nullableString(record.brand_id);
  const startDate = sourceType === "campaign"
    ? nullableString((record as MySqlCampaign).start_date)
    : null;
  const endDate = sourceType === "campaign"
    ? nullableString((record as MySqlCampaign).end_date)
    : null;
  const submitDate = sourceType === "pitch"
    ? nullableString((record as MySqlPitch).date_submit)
    : null;
  const status = sourceType === "campaign"
    ? normalizeCampaignProjectStatus((record as MySqlCampaign).flag ?? (record as MySqlCampaign).state)
    : normalizePitchProjectStatus((record as MySqlPitch).status);

  const sourceUpdatedAt = nullableString(record.updated_at);
  const normalized: PlannerDirectoryProjectRow = {
    projectKey: buildPlannerProjectKey(sourceType, sourceId),
    sourceProjectId: sourceId,
    sourceType,
    name,
    brandId: brandIdValue,
    color: nullableString((record as { color?: string | null }).color),
    status,
    startDate,
    endDate,
    submitDate,
    sourceUpdatedAt,
    sourceHash: hashRecord({
      sourceType,
      sourceId,
      name,
      brand_id: record.brand_id ?? null,
      start_date: startDate,
      end_date: endDate,
      submit_date: submitDate,
      status,
      updated_at: sourceUpdatedAt,
    }),
    syncedAt: nowIso(),
    lastSeenAt: nowIso(),
    archivedAt: null,
  };

  return normalized;
}

export function normalizeEmployeeSource(record: MySqlEmployee): PlannerDirectoryEmployeeRow | null {
  const employeeUuid = nullableString(record.uuid);
  if (!employeeUuid) {
    return null;
  }

  return {
    employeeUuid,
    sourceEmployeeId: nullableString(record.nik),
    employeeNumber: nullableString(record.nik),
    nik: nullableString(record.nik),
    fullName: asString(record.full_name || employeeUuid),
    nickname: nullableString(record.nickname),
    email: null,
    photo: nullableString(record.photo),
    position: nullableString(record.position),
    departmentId: nullableString(record.dept_id),
    weeklyCapacity: 40,
    employmentStatus: record.flag === "active" ? "active" : "inactive",
    visibility: record.status === "visible" ? "active" : "archived",
    workStartDate: nullableString(record.work_start_date),
    sourceUpdatedAt: nullableString(record.updated_at),
    sourceHash: hashRecord({
      uuid: employeeUuid,
      nik: record.nik ?? null,
      full_name: record.full_name ?? null,
      nickname: record.nickname ?? null,
      position: record.position ?? null,
      dept_id: record.dept_id ?? null,
      flag: record.flag ?? null,
      status: record.status ?? null,
      photo: record.photo ?? null,
      work_start_date: record.work_start_date ?? null,
      updated_at: record.updated_at ?? null,
    }),
    syncedAt: nowIso(),
    lastSeenAt: nowIso(),
    archivedAt: null,
  };
}

export function makePlannerDirectoryIssue(
  entityType: string,
  sourceId: string | null,
  severity: PlannerDirectoryIssueSeverity,
  message: string,
  payload: Record<string, unknown> | null = null
) {
  return {
    entityType,
    sourceId,
    severity,
    message,
    payload,
  };
}
