import { assignmentsDb, getDbClient } from "@/lib/mysql-assignments/db";
import type { TimetrackPlannerWebhookEvent } from "@/lib/planner-directory/timetrack-webhook";

type PlannerDirectoryDb = {
  query(sql: string, params?: unknown[]): Promise<unknown>;
};

type SqlDialect = "mysql" | "postgresql";

type TimetrackWebhookInboxOptions = {
  db?: PlannerDirectoryDb;
  now?: () => string;
};

export type TimetrackWebhookClaim = "claimed" | "completed" | "processing";

const DEFAULT_DB = assignmentsDb as unknown as PlannerDirectoryDb;
const MAX_ERROR_MESSAGE_LENGTH = 500;
const PROCESSING_STALE_AFTER_MS = 5 * 60 * 1000;

function defaultNow(): string {
  return new Date().toISOString();
}

function isProcessingStale(processingStartedAt: string | null, nowIso: string): boolean {
  if (!processingStartedAt) {
    return true;
  }

  const startedAtMs = Date.parse(processingStartedAt);
  const nowMs = Date.parse(nowIso);

  if (Number.isNaN(startedAtMs) || Number.isNaN(nowMs)) {
    return true;
  }

  return nowMs - startedAtMs >= PROCESSING_STALE_AFTER_MS;
}

function getDialect(): SqlDialect {
  return getDbClient() === "postgresql" ? "postgresql" : "mysql";
}

function placeholder(n: number, dialect: SqlDialect): string {
  return dialect === "postgresql" ? `$${n}` : "?";
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

export function createTimetrackWebhookInbox(options: TimetrackWebhookInboxOptions = {}) {
  const db = options.db ?? DEFAULT_DB;
  const now = options.now ?? defaultNow;
  const dialect = getDialect();

  async function claim(event: TimetrackPlannerWebhookEvent): Promise<TimetrackWebhookClaim> {
    const receivedAt = now();
    const insertSql =
      dialect === "postgresql"
        ? `INSERT INTO planner_timetrack_webhook_inbox (event_id, event_type, entity_type, entity_uuid, occurred_at, status, received_at) VALUES ($1, $2, $3, $4, $5, 'received', $6) ON CONFLICT (event_id) DO NOTHING`
        : `INSERT IGNORE INTO planner_timetrack_webhook_inbox (event_id, event_type, entity_type, entity_uuid, occurred_at, status, received_at) VALUES (?, ?, ?, ?, ?, 'received', ?)`;
    await db.query(insertSql, [
      event.eventId,
      event.eventType,
      event.entityType,
      event.entityUuid,
      event.occurredAt,
      receivedAt,
    ]);

    const selectSql = `SELECT status, processing_started_at FROM planner_timetrack_webhook_inbox WHERE event_id = ${placeholder(1, dialect)}`;
    const selectResult = await db.query(selectSql, [event.eventId]);
    const row = readFirstRow<{ status: string; processing_started_at: string | null }>(selectResult);
    const status = row?.status;

    if (status === "completed") {
      return "completed";
    }

    if (status === "processing" && !isProcessingStale(row?.processing_started_at ?? null, receivedAt)) {
      return "processing";
    }

    const updateSql =
      dialect === "postgresql"
        ? `UPDATE planner_timetrack_webhook_inbox SET status='processing', processing_started_at=$1 WHERE event_id=$2 AND status IN ('received','failed')`
        : `UPDATE planner_timetrack_webhook_inbox SET status='processing', processing_started_at=? WHERE event_id=? AND status IN ('received','failed')`;
    await db.query(updateSql, [now(), event.eventId]);
    return "claimed";
  }

  async function complete(eventId: string): Promise<void> {
    const sql =
      dialect === "postgresql"
        ? `UPDATE planner_timetrack_webhook_inbox SET status='completed', completed_at=$1, last_error=NULL WHERE event_id=$2`
        : `UPDATE planner_timetrack_webhook_inbox SET status='completed', completed_at=?, last_error=NULL WHERE event_id=?`;
    await db.query(sql, [now(), eventId]);
  }

  async function fail(eventId: string, message: string): Promise<void> {
    const truncatedMessage = message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
    const sql =
      dialect === "postgresql"
        ? `UPDATE planner_timetrack_webhook_inbox SET status='failed', last_error=$1 WHERE event_id=$2`
        : `UPDATE planner_timetrack_webhook_inbox SET status='failed', last_error=? WHERE event_id=?`;
    await db.query(sql, [truncatedMessage, eventId]);
  }

  return { claim, complete, fail };
}
