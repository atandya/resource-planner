import type { ProjectOption } from "@/lib/query/hooks/useProjects";
import type { UpsertBody } from "@/lib/query/hooks/useAssignmentCommands";
import { parseManHoursInput, fillMonthsWithValue, toDateInputValue, getPitchSubmitMonthSpan } from "./split";

export type AssignSpan = { startDate: string; endDate: string };

/** Derive a date span from a project.
 *  - campaign: use startDate + endDate when BOTH are present, else null.
 *  - pitch: the submit month via getPitchSubmitMonthSpan (same span the
 *    single-assign default uses), else null when there's no submitDate.
 *
 *  Campaign dates are coerced through toDateInputValue so verbose driver strings
 *  ("Wed Jun 18 2025 00:00:00 GMT+0700 (...)") become strict "yyyy-MM-dd". The
 *  downstream fillMonthsWithValue parses with `new Date(`${date}T00:00:00`)`,
 *  which yields Invalid Date — rejected via isValid as {}, i.e. zero
 *  allocations — on the verbose form. The single-assign path coerces the same
 *  way; the bulk path must too. */
export function deriveProjectSpan(
  p: Pick<ProjectOption, "projectType" | "startDate" | "endDate" | "submitDate">,
): AssignSpan | null {
  if (p.projectType === "campaign") {
    const startDate = toDateInputValue(p.startDate);
    const endDate = toDateInputValue(p.endDate);
    if (startDate && endDate) return { startDate, endDate };
    return null;
  }
  if (p.submitDate) return getPitchSubmitMonthSpan(p.submitDate);
  return null;
}

/** A project can be bulk-assigned when a usable date span can be derived —
 *  campaigns need both start/end dates, pitches need a submit date. */
export function isAssignableProject(
  p: Pick<ProjectOption, "projectType" | "startDate" | "endDate" | "submitDate">,
): boolean {
  return deriveProjectSpan(p) !== null;
}

export type BulkAssignSummary = {
  assignableProjectCount: number;
  skippedCount: number;
  totalAssignments: number;
};

/** Count how many draft assignments a member×project selection will create.
 *  A project counts only if deriveProjectSpan returns a span; the rest are skipped. */
export function summarizeBulkAssign(
  memberCount: number,
  projects: Array<Pick<ProjectOption, "projectType" | "startDate" | "endDate" | "submitDate">>,
): BulkAssignSummary {
  const assignableProjectCount = projects.filter((p) => isAssignableProject(p)).length;
  return {
    assignableProjectCount,
    skippedCount: projects.length - assignableProjectCount,
    totalAssignments: memberCount * assignableProjectCount,
  };
}

/** One-shot fill: produce a hours-by-member record assigning `value` to every id.
 *  The caller merges this into existing state, so rows stay individually editable after. */
export function applyHoursToAll(memberIds: string[], value: string): Record<string, string> {
  return Object.fromEntries(memberIds.map((id) => [id, value]));
}

/** Project shape the operation builder needs — structural subset of ProjectOption. */
export type BulkAssignProject = Pick<
  ProjectOption,
  "projectKey" | "projectType" | "startDate" | "endDate" | "submitDate"
>;

/** Member shape the operation builder needs. */
export type BulkAssignMember = { id: string };

/** Build the draft upsert payloads for a member×project selection.
 *  A member's hours number is treated as hours-PER-MONTH and applied flat to every month of
 *  each assignable project's span; projects with no usable dates are skipped. */
export function buildBulkAssignOperations(input: {
  members: BulkAssignMember[];
  projects: BulkAssignProject[];
  hoursByMember: Record<string, string>;
}): UpsertBody[] {
  const ops: UpsertBody[] = [];
  for (const m of input.members) {
    const perMonth = parseManHoursInput(input.hoursByMember[m.id]) ?? 0;
    for (const p of input.projects) {
      if (!isAssignableProject(p)) continue;
      const span = deriveProjectSpan(p)!;
      const monthlyHours = fillMonthsWithValue(perMonth, span.startDate, span.endDate);
      ops.push({
        employeeUuid: m.id,
        projectKey: p.projectKey,
        span,
        monthlyHours,
        status: "draft",
        mode: "merge",
      });
    }
  }
  return ops;
}

/**
 * Client-side, case-insensitive name filter for the Bulk Assign project list.
 * The whole brand project list is loaded up front (no pagination), so filtering
 * in memory never misses an off-screen project.
 */
export function filterProjectsByName<T extends { name: string }>(projects: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return projects;
  return projects.filter((p) => p.name.toLowerCase().includes(q));
}
