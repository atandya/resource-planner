import { describe, expect, it, vi } from "vitest";
import { createTimetrackWebhookInbox } from "@/lib/planner-directory/timetrack-webhook-inbox";
import type { TimetrackPlannerWebhookEvent } from "@/lib/planner-directory/timetrack-webhook";

type InboxRow = {
  event_id: string;
  event_type: string;
  entity_type: string;
  entity_uuid: string;
  occurred_at: string;
  status: string;
  received_at: string;
  processing_started_at: string | null;
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
          completed_at: null,
          last_error: null,
        });
      }
      return [[]];
    }

    if (sql.startsWith("SELECT")) {
      const [eventId] = params as string[];
      const row = rows.get(eventId);
      return row ? [[{ status: row.status }]] : [[]];
    }

    if (sql.startsWith("UPDATE") && sql.includes("status='processing'")) {
      const [processingStartedAt, eventId] = params as string[];
      const row = rows.get(eventId);
      if (row && (row.status === "received" || row.status === "failed")) {
        row.status = "processing";
        row.processing_started_at = processingStartedAt;
      }
      return [[]];
    }

    if (sql.startsWith("UPDATE") && sql.includes("status='completed'")) {
      const [completedAt, eventId] = params as string[];
      const row = rows.get(eventId);
      if (row) {
        row.status = "completed";
        row.completed_at = completedAt;
        row.last_error = null;
      }
      return [[]];
    }

    if (sql.startsWith("UPDATE") && sql.includes("status='failed'")) {
      const [lastError, eventId] = params as string[];
      const row = rows.get(eventId);
      if (row) {
        row.status = "failed";
        row.last_error = lastError;
      }
      return [[]];
    }

    throw new Error(`Unhandled SQL in fake db: ${sql}`);
  });

  return { query, rows };
}

describe("timetrack webhook inbox", () => {
  it("claims a new event once, completes it, and treats its redelivery as completed", async () => {
    const { query } = createStatefulDb();
    const inbox = createTimetrackWebhookInbox({ db: { query }, now: () => "2026-07-13T10:00:00.000Z" });

    await expect(inbox.claim(event)).resolves.toBe("claimed");
    await inbox.complete(event.eventId);
    await expect(inbox.claim(event)).resolves.toBe("completed");
  });

  it("allows a manually replayed failed event to be claimed again", async () => {
    const { query } = createStatefulDb();
    const inbox = createTimetrackWebhookInbox({ db: { query }, now: () => "2026-07-13T10:00:00.000Z" });

    await inbox.claim(event);
    await inbox.fail(event.eventId, "TimeTrack fetch failed");
    await expect(inbox.claim(event)).resolves.toBe("claimed");
  });

  it("reports a currently processing event as busy on a concurrent-style redelivery", async () => {
    const { query } = createStatefulDb();
    const inbox = createTimetrackWebhookInbox({ db: { query }, now: () => "2026-07-13T10:00:00.000Z" });

    await expect(inbox.claim(event)).resolves.toBe("claimed");
    await expect(inbox.claim(event)).resolves.toBe("processing");
  });

  it("truncates a stored failure message to 500 characters", async () => {
    const { query, rows } = createStatefulDb();
    const inbox = createTimetrackWebhookInbox({ db: { query }, now: () => "2026-07-13T10:00:00.000Z" });

    await inbox.claim(event);
    const longMessage = "x".repeat(600);
    await inbox.fail(event.eventId, longMessage);

    expect(rows.get(event.eventId)?.last_error).toHaveLength(500);
  });
});
