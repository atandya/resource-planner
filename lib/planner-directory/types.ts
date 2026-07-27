export type PlannerDirectorySourceType = "campaign" | "pitch";
export type PlannerSyncMode = "full_backfill" | "incremental_refresh" | "targeted_repair";
export type PlannerSyncStatus = "queued" | "running" | "succeeded" | "failed" | "skipped";

export type PlannerDirectoryIssueSeverity = "info" | "warning" | "error";

export type PlannerDirectoryDepartmentRow = {
  departmentId: string;
  sourceDepartmentId: string | null;
  name: string;
  code: string | null;
  color: string | null;
  isActive: boolean;
  sourceUpdatedAt: string | null;
  sourceHash: string;
  syncedAt: string;
  lastSeenAt: string;
  archivedAt: string | null;
};

export type PlannerDirectoryBrandRow = {
  brandId: string;
  sourceBrandId: string | null;
  sourceUuid: string | null;
  name: string;
  companyName: string | null;
  color: string | null;
  status: string;
  sourceUpdatedAt: string | null;
  sourceHash: string;
  syncedAt: string;
  lastSeenAt: string;
  archivedAt: string | null;
};

export type PlannerDirectoryProjectRow = {
  projectKey: string;
  sourceProjectId: string;
  sourceType: PlannerDirectorySourceType;
  name: string;
  brandId: string | null;
  brandName?: string | null;
  brandCompanyName?: string | null;
  color: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  submitDate: string | null;
  sourceUpdatedAt: string | null;
  sourceHash: string;
  syncedAt: string;
  lastSeenAt: string;
  archivedAt: string | null;
};

export type PlannerDirectoryEmployeeRow = {
  employeeUuid: string;
  sourceEmployeeId: string | null;
  employeeNumber: string | null;
  nik: string | null;
  fullName: string;
  nickname: string | null;
  email: string | null;
  photo: string | null;
  position: string | null;
  departmentId: string | null;
  weeklyCapacity: number;
  employmentStatus: string;
  visibility: string;
  workStartDate: string | null;
  sourceUpdatedAt: string | null;
  sourceHash: string;
  syncedAt: string;
  lastSeenAt: string;
  archivedAt: string | null;
};

export type PlannerDirectorySyncRun = {
  syncRunId: string;
  syncMode: PlannerSyncMode;
  status: PlannerSyncStatus;
  startedAt: string;
  finishedAt: string | null;
  triggeredBy: string | null;
  triggerSource: string | null;
  employeesSeen: number;
  employeesUpserted: number;
  departmentsSeen: number;
  departmentsUpserted: number;
  brandsSeen: number;
  brandsUpserted: number;
  projectsSeen: number;
  projectsUpserted: number;
  recordsArchived: number;
  issueCount: number;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
};

export type PlannerDirectorySyncIssue = {
  issueId: string;
  syncRunId: string;
  entityType: string;
  sourceId: string | null;
  severity: PlannerDirectoryIssueSeverity;
  message: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

const PLANNER_DIRECTORY_SOURCE_TYPES: PlannerDirectorySourceType[] = ["campaign", "pitch"];
const PLANNER_SYNC_MODES: PlannerSyncMode[] = [
  "full_backfill",
  "incremental_refresh",
  "targeted_repair",
];
const PLANNER_SYNC_STATUSES: PlannerSyncStatus[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "skipped",
];

export function buildPlannerProjectKey(sourceType: PlannerDirectorySourceType, sourceId: string): string {
  return `${sourceType}:${sourceId}`;
}

export function isPlannerProjectSourceType(value: string): value is PlannerDirectorySourceType {
  return PLANNER_DIRECTORY_SOURCE_TYPES.includes(value as PlannerDirectorySourceType);
}

export function isPlannerSyncMode(value: string): value is PlannerSyncMode {
  return PLANNER_SYNC_MODES.includes(value as PlannerSyncMode);
}

export function isPlannerSyncStatus(value: string): value is PlannerSyncStatus {
  return PLANNER_SYNC_STATUSES.includes(value as PlannerSyncStatus);
}
