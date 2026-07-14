import { NextRequest } from "next/server";
import {
  parseTimetrackWebhookEvent,
  TimetrackWebhookValidationError,
} from "@/lib/planner-directory/timetrack-webhook";
import type { TimetrackPlannerWebhookEvent } from "@/lib/planner-directory/timetrack-webhook";
import {
  createTimetrackWebhookInbox,
  type TimetrackWebhookClaim,
} from "@/lib/planner-directory/timetrack-webhook-inbox";
import { processTimetrackPlannerWebhook } from "@/lib/planner-directory/timetrack-webhook-handler";
import { createTimetrackServiceSource } from "@/lib/planner-directory/timetrack-service-source";
import { createPlannerDirectoryRepository } from "@/lib/planner-directory/repository";

export type TimetrackWebhookRouteDependencies = {
  signingSecret: string;
  inbox: {
    claim(event: TimetrackPlannerWebhookEvent): Promise<TimetrackWebhookClaim>;
    complete(eventId: string, processingToken: string): Promise<void>;
    fail(eventId: string, processingToken: string, message: string): Promise<void>;
  };
  process(event: TimetrackPlannerWebhookEvent): Promise<void>;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function requiredWebhookSigningSecret(): string {
  return (
    process.env.TIMETRACK_WEBHOOK_SIGNING_SECRET ||
    process.env.RP_TIMETRACK_WEBHOOK_SIGNING_SECRET ||
    (() => {
      throw new Error(
        "Missing required env var: TIMETRACK_WEBHOOK_SIGNING_SECRET"
      );
    })()
  );
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function handleTimetrackPlannerWebhook(
  request: Request,
  dependencies: TimetrackWebhookRouteDependencies
): Promise<Response> {
  try {
    const event = await parseTimetrackWebhookEvent(
      await request.text(),
      request.headers,
      dependencies.signingSecret
    );
    const claim = await dependencies.inbox.claim(event);
    if (claim.status === "completed") return new Response(null, { status: 204 });
    if (claim.status === "processing") return Response.json({ error: "Event is processing" }, { status: 409 });
    try {
      await dependencies.process(event);
      await dependencies.inbox.complete(event.eventId, claim.processingToken);
      return new Response(null, { status: 204 });
    } catch (error) {
      await dependencies.inbox.fail(event.eventId, claim.processingToken, safeErrorMessage(error));
      return Response.json({ error: "TimeTrack event processing failed" }, { status: 500 });
    }
  } catch (error) {
    const status = error instanceof TimetrackWebhookValidationError ? error.status : 500;
    return Response.json(
      { error: status === 500 ? "Webhook unavailable" : "Invalid TimeTrack webhook" },
      { status }
    );
  }
}

function createProductionDependencies(): TimetrackWebhookRouteDependencies {
  const repository = createPlannerDirectoryRepository();
  const source = createTimetrackServiceSource({ token: requiredEnv("TIMETRACK_RP_READ_TOKEN") });
  const inbox = createTimetrackWebhookInbox();
  return {
    signingSecret: requiredWebhookSigningSecret(),
    inbox,
    process: (event) =>
      processTimetrackPlannerWebhook(event, { source, repository, now: () => new Date().toISOString() }),
  };
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    return await handleTimetrackPlannerWebhook(request, createProductionDependencies());
  } catch {
    // e.g. a missing secret while building production dependencies — never accept unsigned requests.
    return Response.json({ error: "Webhook unavailable" }, { status: 500 });
  }
}
