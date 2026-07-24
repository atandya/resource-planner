import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTimetrackWebhookInbox } from "@/lib/planner-directory/timetrack-webhook-inbox";
import type { TimetrackPlannerWebhookEvent } from "@/lib/planner-directory/timetrack-webhook";

const dbClient = vi.hoisted(() => ({ current: "postgresql" }));

vi.mock("@/lib/mysql-assignments/db", () => ({
  assignmentsDb: {},
  getDbClient: () => dbClient.current,
}));

type InboxRow = {
  event_id: string;
  event_type: string;
  entity_type: string;
  entity_uuid: string;
  occurred_at: string;
  status: string;
  received_at: string;
  processing_started_at: string | null;
  processing_token: string | null;
  completed_at: string | null;
  last_error: string | null;
};

const event: TimetrackPlannerWebhookEvent = {
  schemaVersion: 1,
  eventId: "1c47e991-ff50-459a-8f1d-591c57907bb4",
  eventType: "planner_entity.upserted",
  entityType: "pitch",
  entityUuid: "244eb7d6-d049-4d4b-9998-3cd58746da1c",
  occurredAt: "2026-07-13T09:00:00.000Z",
};

function createStatefulDb() {
  const rows = new Map<string, InboxRow>();

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    // Idempotent insert (dialect-agnostic detection via the table name).
    if (sql.startsWith("INSERT")) {
      const [eventId, eventType, entityType, entityUuid, occurredAt, receivedAt] = params as string[];
      if (!rows.has(eventId)) {
        rows.set(eventId, {
          event_id: eventId,
          event_type: eventType,
          entity_type: entityType,
          entity_uuid: entityUuid,
          occurred_at: occurredAt,
          status: "received",
          received_at: receivedAt,
          processing_started_at: null,
          processing_token: null,
          completed_at: null,
          last_error: null,
        });
      }
      return [[]];
    }

    if (sql.startsWith("SELECT")) {
      const [eventId] = params as string[];
      const row = rows.get(eventId);
      return row
        ? [[{
            status: row.status,
            processing_started_at: row.processing_started_at,
            processing_token: row.processing_token,
          }]]
        : [[]];
    }

    if (sql.startsWith("UPDATE") && sql.includes("SET status='processing'")) {
      const [processingStartedAt, processingToken, eventId, staleBefore] = params as string[];
      const row = rows.get(eventId);
      const canClaim =
        row &&
        (row.status === "received" ||
          row.status === "failed" ||
          (row.status === "processing" &&
            row.processing_started_at !== null &&
            row.processing_started_at <= staleBefore));
      if (canClaim) {
        row.status = "processing";
        row.processing_started_at = processingStartedAt;
        row.processing_token = processingToken;
      }
      return [[]];
    }

    if (sql.startsWith("UPDATE") && sql.includes("status='completed'")) {
      const [completedAt, eventId, processingToken] = params as string[];
      const row = rows.get(eventId);
      if (row?.status === "processing" && row.processing_token === processingToken) {
        row.status = "completed";
        row.completed_at = completedAt;
        row.last_error = null;
        row.processing_token = null;
        return [[{ event_id: eventId }]];
      }
      return [[]];
    }

    if (sql.startsWith("UPDATE") && sql.includes("status='failed'")) {
      const [lastError, eventId, processingToken] = params as string[];
      const row = rows.get(eventId);
      if (row?.status === "processing" && row.processing_token === processingToken) {
        row.status = "failed";
        row.last_error = lastError;
        row.processing_token = null;
      }
      return [[]];
    }

    throw new Error(`Unhandled SQL in fake db: ${sql}`);
  });

  return { query, rows };
}

describe("timetrack webhook inbox", () => {
  beforeEach(() => {
    dbClient.current = "postgresql";
  });

  it("claims a new event once, completes it, and treats its redelivery as completed", async () => {
    const { query } = createStatefulDb();
    const inbox = createTimetrackWebhookInbox({ db: { query }, now: () => "2026-07-13T10:00:00.000Z" });

    const claim = await inbox.claim(event);
    expect(claim.status).toBe("claimed");
    if (claim.status !== "claimed") throw new Error("expected initial claim");

    await expect(inbox.complete(event.eventId, claim.processingToken)).resolves.toBe(true);
    await expect(inbox.claim(event)).resolves.toEqual({ status: "completed" });
  });

  it("allows a manually replayed failed event to be claimed again", async () => {
    const { query } = createStatefulDb();
    const inbox = createTimetrackWebhookInbox({ db: { query }, now: () => "2026-07-13T10:00:00.000Z" });

    const claim = await inbox.claim(event);
    if (claim.status !== "claimed") throw new Error("expected initial claim");

    await inbox.fail(event.eventId, claim.processingToken, "TimeTrack fetch failed");
    await expect(inbox.claim(event)).resolves.toMatchObject({ status: "claimed" });
  });

  it("reports a currently processing event as busy on a concurrent-style redelivery", async () => {
    const { query } = createStatefulDb();
    const inbox = createTimetrackWebhookInbox({ db: { query }, now: () => "2026-07-13T10:00:00.000Z" });

    await expect(inbox.claim(event)).resolves.toMatchObject({ status: "claimed" });
    await expect(inbox.claim(event)).resolves.toEqual({ status: "processing" });
  });

  it("reclaims a stale processing event with a new lease token", async () => {
    const { query, rows } = createStatefulDb();
    rows.set(event.eventId, {
      event_id: event.eventId,
      event_type: event.eventType,
      entity_type: event.entityType,
      entity_uuid: event.entityUuid,
      occurred_at: event.occurredAt,
      status: "processing",
      received_at: "2026-07-13T09:00:00.000Z",
      processing_started_at: "2026-07-13T09:54:59.000Z",
      processing_token: "expired-token",
      completed_at: null,
      last_error: null,
    });
    const inbox = createTimetrackWebhookInbox({ db: { query }, now: () => "2026-07-13T10:00:00.000Z" });

    const claim = await inbox.claim(event);
    expect(claim.status).toBe("claimed");
    expect(claim).toMatchObject({ processingToken: expect.any(String) });
    expect(rows.get(event.eventId)?.processing_token).not.toBe("expired-token");
  });

  it("does not let an expired lease complete a newer claim", async () => {
    const { query, rows } = createStatefulDb();
    const inbox = createTimetrackWebhookInbox({ db: { query }, now: () => "2026-07-13T10:00:00.000Z" });
    const first = await inbox.claim(event);
    if (first.status !== "claimed") throw new Error("expected initial claim");
    rows.get(event.eventId)!.processing_started_at = "2026-07-13T09:54:59.000Z";
    const second = await inbox.claim(event);
    if (second.status !== "claimed") throw new Error("expected stale reclaim");

    await expect(inbox.complete(event.eventId, first.processingToken)).resolves.toBe(false);
    expect(rows.get(event.eventId)?.status).toBe("processing");
    await expect(inbox.complete(event.eventId, second.processingToken)).resolves.toBe(true);
    expect(rows.get(event.eventId)?.status).toBe("completed");
  });

  it("uses MySQL affectedRows to report whether completion matched the lease", async () => {
    dbClient.current = "mysql";
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 0 }]);
    const inbox = createTimetrackWebhookInbox({
      db: { query },
      now: () => "2026-07-13T10:00:00.000Z",
    });

    await expect(inbox.complete(event.eventId, "matching-token")).resolves.toBe(true);
    await expect(inbox.complete(event.eventId, "nonmatching-token")).resolves.toBe(false);
    expect(query.mock.calls.every(([sql]) => !String(sql).includes("RETURNING"))).toBe(true);
  });

  it("does not let an expired lease fail a newer claim", async () => {
    const { query, rows } = createStatefulDb();
    const inbox = createTimetrackWebhookInbox({ db: { query }, now: () => "2026-07-13T10:00:00.000Z" });
    const first = await inbox.claim(event);
    if (first.status !== "claimed") throw new Error("expected initial claim");
    rows.get(event.eventId)!.processing_started_at = "2026-07-13T09:54:59.000Z";
    const second = await inbox.claim(event);
    if (second.status !== "claimed") throw new Error("expected stale reclaim");

    await inbox.fail(event.eventId, first.processingToken, "stale worker failed");
    expect(rows.get(event.eventId)?.status).toBe("processing");
    await inbox.fail(event.eventId, second.processingToken, "current worker failed");
    expect(rows.get(event.eventId)?.status).toBe("failed");
  });

  it("truncates a stored failure message to 500 characters", async () => {
    const { query, rows } = createStatefulDb();
    const inbox = createTimetrackWebhookInbox({ db: { query }, now: () => "2026-07-13T10:00:00.000Z" });

    const claim = await inbox.claim(event);
    if (claim.status !== "claimed") throw new Error("expected initial claim");
    const longMessage = "x".repeat(600);
    await inbox.fail(event.eventId, claim.processingToken, longMessage);

    expect(rows.get(event.eventId)?.last_error).toHaveLength(500);
  });
});
