import { z } from "zod";

export type TimetrackPlannerWebhookEvent = {
  schemaVersion: 1;
  eventId: string;
  eventType: "planner_entity.upserted" | "planner_entity.deleted";
  entityType: "brand" | "pitch" | "campaign";
  entityUuid: string;
  occurredAt: string;
};

export class TimetrackWebhookValidationError extends Error {
  constructor(message: string, readonly status: 400 | 401) {
    super(message);
  }
}

const eventSchema = z.object({
  schema_version: z.literal(1),
  event_id: z.string().uuid(),
  event_type: z.enum(["planner_entity.upserted", "planner_entity.deleted"]),
  entity_type: z.enum(["brand", "pitch", "campaign"]),
  entity_uuid: z.string().uuid(),
  occurred_at: z.string().datetime(),
});

const MAX_CLOCK_SKEW_SECONDS = 300;

async function hmacHex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function signTimetrackWebhook(
  rawBody: string,
  secret: string,
  timestamp: number
): Promise<string> {
  return `sha256=${await hmacHex(`${timestamp}.${rawBody}`, secret)}`;
}

async function signaturesMatch(
  providedSignature: string,
  signedPayload: string,
  secret: string
): Promise<boolean> {
  const providedHex = providedSignature.startsWith("sha256=")
    ? providedSignature.slice("sha256=".length)
    : providedSignature;
  const computedHex = await hmacHex(signedPayload, secret);

  if (providedHex.length !== computedHex.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < computedHex.length; i++) {
    diff |= providedHex.charCodeAt(i) ^ computedHex.charCodeAt(i);
  }
  return diff === 0;
}

export async function parseTimetrackWebhookEvent(
  rawBody: string,
  headers: Headers,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<TimetrackPlannerWebhookEvent> {
  const timestamp = Number(headers.get("x-timetrack-timestamp"));
  const signature = headers.get("x-timetrack-signature");
  const headerEventId = headers.get("x-timetrack-event-id");
  if (
    !Number.isInteger(timestamp) ||
    !signature ||
    !headerEventId ||
    Math.abs(nowSeconds - timestamp) > MAX_CLOCK_SKEW_SECONDS
  ) {
    throw new TimetrackWebhookValidationError("Invalid TimeTrack webhook authentication", 401);
  }
  if (!(await signaturesMatch(signature, `${timestamp}.${rawBody}`, secret))) {
    throw new TimetrackWebhookValidationError("Invalid TimeTrack webhook authentication", 401);
  }
  let event: z.infer<typeof eventSchema>;
  try {
    event = eventSchema.parse(JSON.parse(rawBody));
  } catch {
    throw new TimetrackWebhookValidationError("Malformed TimeTrack webhook payload", 400);
  }
  if (event.event_id !== headerEventId) {
    throw new TimetrackWebhookValidationError("Event ID header does not match payload", 400);
  }
  return {
    schemaVersion: event.schema_version,
    eventId: event.event_id,
    eventType: event.event_type,
    entityType: event.entity_type,
    entityUuid: event.entity_uuid,
    occurredAt: event.occurred_at,
  };
}
