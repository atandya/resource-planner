import { describe, expect, it, vi } from "vitest";
import { handleTimetrackPlannerWebhook } from "@/app/api/webhooks/timetrack/planner/route";
import { signTimetrackWebhook } from "@/lib/planner-directory/timetrack-webhook";

const secret = "route-test-secret";
const eventId = "1c47e991-ff50-459a-8f1d-591c57907bb4";
const bodyObj = {
  schema_version: 1,
  event_id: eventId,
  event_type: "planner_entity.upserted",
  entity_type: "pitch",
  entity_uuid: "244eb7d6-d049-4d4b-9998-3cd58746da1c",
  occurred_at: "2026-07-13T10:00:00.000Z",
};

async function signedRequest(): Promise<Request> {
  const raw = JSON.stringify(bodyObj);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await signTimetrackWebhook(raw, secret, timestamp);
  return new Request("https://rp.example/api/webhooks/timetrack/planner", {
    method: "POST",
    headers: {
      "X-Timetrack-Event-Id": eventId,
      "X-Timetrack-Timestamp": String(timestamp),
      "X-Timetrack-Signature": signature,
      "Content-Type": "application/json",
    },
    body: raw,
  });
}

function deps(overrides: Partial<ReturnType<typeof baseDeps>> = {}) {
  return {
    ...baseDeps(),
    ...overrides,
  };
}

function baseDeps() {
  return {
    signingSecret: secret,
    inbox: {
      claim: vi.fn().mockResolvedValue({ status: "claimed", processingToken: "claim-token" }),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
    },
    process: vi.fn().mockResolvedValue(undefined),
  };
}

describe("handleTimetrackPlannerWebhook", () => {
  it("claims and processes a valid event, returning 204", async () => {
    const dependencies = deps();
    const response = await handleTimetrackPlannerWebhook(await signedRequest(), dependencies);

    expect(response.status).toBe(204);
    expect(dependencies.process).toHaveBeenCalledTimes(1);
    expect(dependencies.inbox.complete).toHaveBeenCalledWith(eventId, "claim-token");
    expect(dependencies.inbox.fail).not.toHaveBeenCalled();
  });

  it("returns 204 without reprocessing when the inbox reports the event already completed", async () => {
    const dependencies = deps({
      inbox: {
        claim: vi.fn().mockResolvedValue({ status: "completed" }),
        complete: vi.fn().mockResolvedValue(undefined),
        fail: vi.fn().mockResolvedValue(undefined),
      },
    });
    const response = await handleTimetrackPlannerWebhook(await signedRequest(), dependencies);

    expect(response.status).toBe(204);
    expect(dependencies.process).not.toHaveBeenCalled();
    expect(dependencies.inbox.complete).not.toHaveBeenCalled();
  });

  it("returns 409 when another request is currently processing the event", async () => {
    const dependencies = deps({
      inbox: {
        claim: vi.fn().mockResolvedValue({ status: "processing" }),
        complete: vi.fn().mockResolvedValue(undefined),
        fail: vi.fn().mockResolvedValue(undefined),
      },
    });
    const response = await handleTimetrackPlannerWebhook(await signedRequest(), dependencies);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Event is processing" });
    expect(dependencies.process).not.toHaveBeenCalled();
  });

  it("marks the event failed and returns 500 when processing throws", async () => {
    const dependencies = deps({
      process: vi.fn().mockRejectedValue(new Error("boom")),
    });
    const response = await handleTimetrackPlannerWebhook(await signedRequest(), dependencies);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "TimeTrack event processing failed" });
    expect(dependencies.inbox.fail).toHaveBeenCalledWith(eventId, "claim-token", expect.any(String));
    expect(dependencies.inbox.complete).not.toHaveBeenCalled();
  });

  it("returns 401 and never claims when the signature is invalid", async () => {
    const raw = JSON.stringify(bodyObj);
    const timestamp = Math.floor(Date.now() / 1000);
    const request = new Request("https://rp.example/api/webhooks/timetrack/planner", {
      method: "POST",
      headers: {
        "X-Timetrack-Event-Id": eventId,
        "X-Timetrack-Timestamp": String(timestamp),
        "X-Timetrack-Signature": "sha256=deadbeef",
        "Content-Type": "application/json",
      },
      body: raw,
    });

    const dependencies = deps();
    const response = await handleTimetrackPlannerWebhook(request, dependencies);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Invalid TimeTrack webhook" });
    expect(dependencies.inbox.claim).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed body that is nonetheless validly signed", async () => {
    const raw = "{not valid json";
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await signTimetrackWebhook(raw, secret, timestamp);
    const request = new Request("https://rp.example/api/webhooks/timetrack/planner", {
      method: "POST",
      headers: {
        "X-Timetrack-Event-Id": eventId,
        "X-Timetrack-Timestamp": String(timestamp),
        "X-Timetrack-Signature": signature,
        "Content-Type": "application/json",
      },
      body: raw,
    });

    const dependencies = deps();
    const response = await handleTimetrackPlannerWebhook(request, dependencies);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid TimeTrack webhook" });
    expect(dependencies.inbox.claim).not.toHaveBeenCalled();
  });
});
