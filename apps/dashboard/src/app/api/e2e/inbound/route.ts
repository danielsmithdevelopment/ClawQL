import { createHmac, timingSafeEqual } from "node:crypto";

import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness, runE2eEffect } from "@/lib/managed/e2e/service";
import {
  appendAudit,
  deliverEventToSubscriptions,
  getWorld,
  pushEvent,
} from "@/lib/managed/e2e/world";

export const dynamic = "force-dynamic";

function verifyGitHubSignature(secret: string, rawBody: string, signature: string | null): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** GitHub (and similar) inbound webhook verification. */
export async function POST(req: Request) {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const world = getWorld();
      const rawBody = yield* Effect.tryPromise({
        try: () => req.text(),
        catch: () => "",
      });
      const sig = req.headers.get("x-hub-signature-256");
      const deliveryId = req.headers.get("x-github-delivery") ?? req.headers.get("webhook-id");
      const tsHeader = req.headers.get("x-hub-timestamp") ?? req.headers.get("webhook-timestamp");
      const secret = world.webhookSigningSecret;

      // Replay window (5 minutes)
      if (tsHeader) {
        const ts = Number(tsHeader);
        const age = Math.abs(Date.now() / 1000 - ts);
        if (age > 300) {
          world.inboundWebhookStats.rejected += 1;
          world.inboundWebhookStats.replays += 1;
          appendAudit("inbound", "webhook.replay", "Rejected as a replay");
          return NextResponse.json({ error: "replay rejected" }, { status: 401 });
        }
      }
      if (deliveryId && world.seenInboundIds.has(deliveryId)) {
        world.inboundWebhookStats.rejected += 1;
        world.inboundWebhookStats.replays += 1;
        appendAudit("inbound", "webhook.replay", "Rejected as a replay", { deliveryId });
        return NextResponse.json({ error: "replay rejected" }, { status: 401 });
      }

      if (!verifyGitHubSignature(secret, rawBody, sig)) {
        world.inboundWebhookStats.rejected += 1;
        appendAudit("inbound", "webhook.bad_signature", "Rejected");
        return NextResponse.json({ error: "bad signature" }, { status: 401 });
      }

      if (deliveryId) world.seenInboundIds.add(deliveryId);
      world.inboundWebhookStats.accepted += 1;

      let payload: unknown = {};
      try {
        payload = JSON.parse(rawBody);
      } catch {
        payload = { raw: rawBody };
      }

      const evt = pushEvent(
        "stream.changed",
        { ...(typeof payload === "object" && payload ? payload : { payload }), untrusted: true },
        { inbound: true, untrusted: true, source: "inbound:github" },
      );
      appendAudit("inbound", "webhook.github", "Accepted as stream.changed inbound:github");

      // Only subscriptions that opted into inbound / stream.changed
      yield* Effect.tryPromise({
        try: () => deliverEventToSubscriptions(evt),
        catch: () => undefined as void,
      });

      return NextResponse.json({
        ok: true,
        eventId: evt.id,
        type: "stream.changed",
        inbound: "github",
        untrusted: true,
        stats: world.inboundWebhookStats,
      });
    }),
  );
}

export async function GET() {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      return NextResponse.json({ stats: getWorld().inboundWebhookStats });
    }),
  );
}
