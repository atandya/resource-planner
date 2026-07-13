import { describe, expect, it } from "vitest";
import {
  parseTimetrackWebhookEvent,
  signTimetrackWebhook,
} from "@/lib/planner-directory/timetrack-webhook";

const secret = "test-signing-secret";
async function signedHeaders(
  rawBody: string,
  signingSecret: string,
  timestamp: number
): Promise<Headers> {
  return new Headers({
    "X-Timetrack-Event-Id": "1c47e991-ff50-459a-8f1d-591c57907bb4",
    "X-Timetrack-Timestamp": String(timestamp),
    "X-Timetrack-Signature": await signTimetrackWebhook(rawBody, signingSecret, timestamp),
  });
}

const body = JSON.stringify({
  schema_version: 1,
  event_id: "1c47e991-ff50-459a-8f1d-591c57907bb4",
  event_type: "planner_entity.upserted",
  entity_type: "pitch",
  entity_uuid: "244eb7d6-d049-4d4b-9998-3cd58746da1c",
  occurred_at: "2026-07-13T10:00:00.000Z",
});

describe("parseTimetrackWebhookEvent", () => {
  it("accepts a correctly signed current event", async () => {
    const headers = await signedHeaders(body, secret, 1_784_003_000);
    await expect(
      parseTimetrackWebhookEvent(body, headers, secret, 1_784_003_010)
    ).resolves.toMatchObject({ entityType: "pitch" });
  });

  it("rejects a stale timestamp before processing", async () => {
    const headers = await signedHeaders(body, secret, 1_784_003_000);
    await expect(
      parseTimetrackWebhookEvent(body, headers, secret, 1_784_003_301)
    ).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a signature or event-id header that does not match the raw body", async () => {
    const headers = await signedHeaders(body, secret, 1_784_003_000);
    headers.set("X-Timetrack-Signature", "sha256=wrong");
    await expect(
      parseTimetrackWebhookEvent(body, headers, secret, 1_784_003_010)
    ).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a malformed JSON body", async () => {
    const malformedBody = "{not json";
    const headers = await signedHeaders(malformedBody, secret, 1_784_003_000);
    await expect(
      parseTimetrackWebhookEvent(malformedBody, headers, secret, 1_784_003_010)
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a header event-id that mismatches the parsed payload event_id", async () => {
    const headers = await signedHeaders(body, secret, 1_784_003_000);
    headers.set("X-Timetrack-Event-Id", "00000000-0000-0000-0000-000000000000");
    await expect(
      parseTimetrackWebhookEvent(body, headers, secret, 1_784_003_010)
    ).rejects.toMatchObject({ status: 400 });
  });
});
