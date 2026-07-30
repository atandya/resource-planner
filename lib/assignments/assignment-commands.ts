import { assignmentsDb } from "@/lib/mysql-assignments/db";
import { randomUUID } from "crypto";
import { toDateInputValue } from "./split";
import { validateAssignmentWrite } from "./assignment-validation";

export type AllocRow = { month: string; plannedHours: number; kind: "plan" | "adjustment" };

export function buildAllocationRows(monthlyHours: Record<string, number>, kind: "plan" | "adjustment"): AllocRow[] {
  return Object.entries(monthlyHours)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, plannedHours]) => ({ month, plannedHours, kind }));
}

export type UpsertAssignmentInput = {
  employeeUuid: string;
  projectKey: string;
  span: { startDate: string; endDate: string };
  monthlyHours: Record<string, number>;
  status?: "draft" | "confirmed";
  note?: string | null;
  kind?: "plan" | "adjustment";
  mode?: "replace" | "merge";
  actingUserUuid: string | null;
};

/** THE write primitive. Upserts the engagement header + its monthly allocations, transactionally. */
export async function upsertAssignment(input: UpsertAssignmentInput): Promise<string> {
  const { employeeUuid, projectKey, monthlyHours, actingUserUuid } = input;
  const kind = input.kind ?? "plan";
  const mode = input.mode ?? "replace";
  const status = input.status ?? "draft";
  // Coerce verbose/timestamped driver dates (e.g. "Wed Jun 18 2025 ...") to strict
  // yyyy-MM-dd before validating or writing — protects every caller, not just bulk.
  const span = {
    startDate: toDateInputValue(input.span?.startDate),
    endDate: toDateInputValue(input.span?.endDate),
  };
  validateAssignmentWrite({ span, monthlyHours });
  const rows = buildAllocationRows(monthlyHours, kind);

  const client = await assignmentsDb.getConnection();
  // Cast to the Postgres-flavoured shape: client.query() returns { rows: any[] }
  const pgClient = client as { query(sql: string, params?: any[]): Promise<{ rows: any[] }>; release(): Promise<void> };
  try {
    await pgClient.query("BEGIN");
    const existing = await pgClient.query(
      `SELECT assignment_uuid FROM planner_assignments WHERE employee_uuid=$1 AND project_key=$2`,
      [employeeUuid, projectKey]
    );
    let assignmentUuid: string;
    if (existing.rows[0]) {
      assignmentUuid = existing.rows[0].assignment_uuid;
      await pgClient.query(
        `UPDATE planner_assignments SET start_date=$1, end_date=$2, status=$3, note=$4, updated_by=$5, updated_at=now() WHERE assignment_uuid=$6`,
        [span.startDate, span.endDate, status, input.note ?? null, actingUserUuid, assignmentUuid]
      );
    } else {
      assignmentUuid = randomUUID();
      await pgClient.query(
        `INSERT INTO planner_assignments (assignment_uuid, employee_uuid, project_key, start_date, end_date, status, note, created_by, updated_by, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8, now(), now())`,
        [assignmentUuid, employeeUuid, projectKey, span.startDate, span.endDate, status, input.note ?? null, actingUserUuid]
      );
    }
    if (mode === "replace") {
      await pgClient.query(`DELETE FROM planner_assignment_allocations WHERE assignment_uuid=$1 AND kind=$2`, [assignmentUuid, kind]);
    }
    for (const r of rows) {
      await pgClient.query(
        `INSERT INTO planner_assignment_allocations (assignment_uuid, month, planned_hours, kind) VALUES ($1,$2,$3,$4) ON CONFLICT (assignment_uuid, month, kind) DO UPDATE SET planned_hours = EXCLUDED.planned_hours`,
        [assignmentUuid, r.month, r.plannedHours, r.kind]
      );
    }
    await pgClient.query("COMMIT");
    return assignmentUuid;
  } catch (e) {
    await pgClient.query("ROLLBACK");
    throw e;
  } finally {
    await pgClient.release();
  }
}

export async function removeAssignment(employeeUuid: string, projectKey: string): Promise<void> {
  await assignmentsDb.execute(
    `DELETE FROM planner_assignments WHERE employee_uuid=$1 AND project_key=$2`, [employeeUuid, projectKey]);
}

const MONTH_RE = /^\d{4}-\d{2}-01$/;

/**
 * Deletes a single month's allocation row. If it was the engagement's last
 * allocation (any kind), the engagement header is deleted too so it doesn't
 * linger as an empty ghost row. Otherwise the engagement span is shrunk to
 * the remaining allocation months.
 */
export async function removeAllocationMonth(
  assignmentUuid: string,
  month: string,
  kind: "plan" | "adjustment" = "plan"
): Promise<{ engagementDeleted: boolean }> {
  if (!MONTH_RE.test(month)) throw new Error("month must be yyyy-MM-01");

  const client = await assignmentsDb.getConnection();
  const pgClient = client as { query(sql: string, params?: any[]): Promise<{ rows: any[] }>; release(): Promise<void> };
  try {
    await pgClient.query("BEGIN");
    await pgClient.query(
      `DELETE FROM planner_assignment_allocations WHERE assignment_uuid=$1 AND month=$2 AND kind=$3`,
      [assignmentUuid, month, kind]
    );
    const remaining = await pgClient.query(
      `SELECT to_char(min(month),'YYYY-MM-DD') AS min_m, to_char(max(month),'YYYY-MM-DD') AS max_m
       FROM planner_assignment_allocations WHERE assignment_uuid=$1`,
      [assignmentUuid]
    );
    const { min_m, max_m } = remaining.rows[0] ?? {};
    let engagementDeleted = false;
    if (!min_m) {
      await pgClient.query(`DELETE FROM planner_assignments WHERE assignment_uuid=$1`, [assignmentUuid]);
      engagementDeleted = true;
    } else {
      await pgClient.query(
        `UPDATE planner_assignments
           SET start_date = GREATEST(start_date, $2::date),
               end_date = LEAST(end_date, ($3::date + interval '1 month' - interval '1 day')::date),
               updated_at = now()
         WHERE assignment_uuid=$1`,
        [assignmentUuid, min_m, max_m]
      );
    }
    await pgClient.query("COMMIT");
    return { engagementDeleted };
  } catch (e) {
    await pgClient.query("ROLLBACK");
    throw e;
  } finally {
    await pgClient.release();
  }
}
