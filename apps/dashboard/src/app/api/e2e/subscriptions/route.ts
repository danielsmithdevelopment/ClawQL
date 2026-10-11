import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness, runE2eEffect } from "@/lib/managed/e2e/service";
import { webhookHostRefused } from "@/lib/managed/e2e/webhook-host";
import { appendAudit, getWorld, newId } from "@/lib/managed/e2e/world";

export const dynamic = "force-dynamic";

export async function GET() {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      return NextResponse.json({ subscriptions: getWorld().subscriptions });
    }),
  );
}

export async function POST(req: Request) {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const body = (yield* Effect.tryPromise({
        try: () =>
          req.json() as Promise<{
            url?: string;
            events?: string[];
            challengeOk?: boolean;
            action?: "pause" | "resume" | "create";
            id?: string;
          }>,
        catch: () => ({}),
      })) as {
        url?: string;
        events?: string[];
        challengeOk?: boolean;
        action?: string;
        id?: string;
      };

      const world = getWorld();
      if (body.action === "pause" && body.id) {
        const sub = world.subscriptions.find((s) => s.id === body.id);
        if (sub) {
          sub.paused = true;
          sub.health = "Paused";
        }
        return NextResponse.json({ ok: true, paused: true });
      }
      if (body.action === "resume" && body.id) {
        const sub = world.subscriptions.find((s) => s.id === body.id);
        if (sub) {
          sub.paused = false;
          sub.active = true;
          sub.health = "Healthy";
        }
        return NextResponse.json({ ok: true, resumed: true });
      }

      let url: URL;
      try {
        url = new URL(body.url ?? "");
      } catch {
        return NextResponse.json({ error: "invalid url" }, { status: 400 });
      }
      const blocked = yield* webhookHostRefused(url.hostname);
      if (blocked) {
        appendAudit("Dana Reyes", "subscription.create", `Refused — ${blocked}`, {
          url: body.url,
        });
        return NextResponse.json({ error: blocked }, { status: 400 });
      }
      const challengeOk = body.challengeOk !== false;
      const id = newId("sub");
      world.subscriptions.push({
        id,
        url: url.toString(),
        events: body.events ?? ["document.processed"],
        active: challengeOk,
        paused: false,
        health: challengeOk ? "Healthy" : "Pending challenge",
        secret: world.webhookSigningSecret,
        challengeAccepted: challengeOk,
        pendingRetries: [],
      });
      appendAudit("Dana Reyes", "subscription.create", challengeOk ? "Created" : "Challenge pending", {
        id,
        url: url.toString(),
      });
      return NextResponse.json({ ok: true, id, active: challengeOk });
    }),
  );
}

export async function PATCH(req: Request) {
  return POST(req);
}
