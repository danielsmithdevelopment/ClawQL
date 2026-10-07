/**
 * Stripe Checkout + inbound webhook for Cloud E2E (SU-01 / SU-02 / SU-03).
 * POST /billing/checkout creates a Checkout Session (arrange).
 * POST /events/inbound/stripe handles checkout.session.completed (Pass-when provision).
 * Mirrors stripe listen --forward-to …/events/inbound/stripe.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness } from "@/lib/managed/e2e/service";
import { appendAudit, getWorld, newId, pushEvent } from "@/lib/managed/e2e/world";

export type BillingCheckoutBody = {
  signedInUserId?: string;
  foreignUserId?: string;
  replay?: boolean;
  testCard?: string;
  /** When true, also provision in-process (legacy). Prefer inbound webhook. */
  provisionInline?: boolean;
};

function stripeWebhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || getWorld().webhookSigningSecret;
}

/** Stripe-shaped signature: t=<unix>,v1=<hmac_sha256(t.payload, secret)>. */
export function signStripeWebhook(payload: string, secret: string, t = Math.floor(Date.now() / 1000)): string {
  const signed = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${signed}`;
}

export function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const [k, ...rest] = p.trim().split("=");
      return [k ?? "", rest.join("=")];
    }),
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(Number(t)) || age > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  try {
    const a = Buffer.from(v1);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function provisionFromCheckout(opts: {
  signedInUserId: string;
  sessionId: string;
  testCard?: boolean;
}): {
  provisioned: boolean;
  replayIgnored: boolean;
  orgId: string;
  owner: string;
  firstRun: string;
} {
  const world = getWorld();
  const signedIn = opts.signedInUserId;

  if (world.stripeProvisioningDone) {
    appendAudit("stripe", "checkout.completed", "Ignored replay — already provisioned", {
      signedInUserId: signedIn,
      sessionId: opts.sessionId,
      replay: true,
    });
    return {
      provisioned: false,
      replayIgnored: true,
      orgId: world.orgId,
      owner: world.people.find((p) => p.role === "owner")?.name ?? "Dana Reyes",
      firstRun: `${world.firstRunStep} of ${world.firstRunTotal}`,
    };
  }

  world.stripeProvisioningDone = true;
  world.signedInUserId = signedIn;
  world.firstRunStep = 1;
  world.orgName = world.orgName || "Acme Robotics";
  world.stripeCheckoutSessionId = opts.sessionId;
  appendAudit("system", "org.created", "Organization created", { orgId: world.orgId });
  appendAudit("Dana Reyes", "owner.joined", "Owner joined", { userId: signedIn });
  appendAudit("stripe", "plan.started", "Team plan started", {
    testCard: opts.testCard ?? true,
    sessionId: opts.sessionId,
  });
  appendAudit("stripe", "checkout.completed", "Provisioned", {
    signedInUserId: signedIn,
    sessionId: opts.sessionId,
  });

  return {
    provisioned: true,
    replayIgnored: false,
    orgId: world.orgId,
    owner: "Dana Reyes",
    firstRun: `${world.firstRunStep} of ${world.firstRunTotal}`,
  };
}

/** Create Checkout Session — does not provision unless provisionInline. */
export function postBillingCheckout(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }
    const world = getWorld();
    const body = (yield* Effect.tryPromise({
      try: () => req.json() as Promise<BillingCheckoutBody>,
      catch: () => ({}),
    })) as BillingCheckoutBody;

    const signedIn = body.signedInUserId ?? world.signedInUserId ?? "user_dana";
    // Foreign ID in the request is ignored (SU-03)
    void body.foreignUserId;
    void body.replay;

    const sessionId = world.stripeCheckoutSessionId || newId("cs");
    world.stripeCheckoutSessionId = sessionId;
    world.pendingStripeCheckout = {
      sessionId,
      signedInUserId: signedIn,
      testCard: body.testCard ?? "4242424242424242",
    };

    if (body.provisionInline) {
      const result = provisionFromCheckout({
        signedInUserId: signedIn,
        sessionId,
        testCard: true,
      });
      return NextResponse.json({
        ok: true,
        sessionId,
        checkoutUrl: `https://checkout.stripe.com/c/pay/${sessionId}`,
        landOn: "/",
        ...result,
      });
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      checkoutUrl: `https://checkout.stripe.com/c/pay/${sessionId}`,
      provisioned: false,
      awaitWebhook: true,
      landOn: "/",
      hint: "POST /events/inbound/stripe with checkout.session.completed (stripe listen)",
    });
  });
}

type StripeEventBody = {
  id?: string;
  type?: string;
  data?: {
    object?: {
      id?: string;
      object?: string;
      metadata?: Record<string, string>;
      customer_email?: string;
      mode?: string;
    };
  };
};

/** Stripe listen target — checkout.session.completed provisions idempotently. */
export function postStripeInbound(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }
    const world = getWorld();
    const rawBody = yield* Effect.tryPromise({
      try: () => req.text(),
      catch: () => "",
    });
    const secret = stripeWebhookSecret();
    const sig =
      req.headers.get("stripe-signature") ?? req.headers.get("Stripe-Signature");

    if (!verifyStripeWebhookSignature(rawBody, sig, secret)) {
      world.inboundWebhookStats.rejected += 1;
      appendAudit("inbound", "webhook.bad_signature", "Rejected Stripe signature");
      return NextResponse.json({ error: "bad signature" }, { status: 401 });
    }

    let event: StripeEventBody = {};
    try {
      event = JSON.parse(rawBody) as StripeEventBody;
    } catch {
      world.inboundWebhookStats.rejected += 1;
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }

    const eventId = event.id ?? newId("evt");
    if (world.seenInboundIds.has(eventId)) {
      world.inboundWebhookStats.rejected += 1;
      world.inboundWebhookStats.replays += 1;
      appendAudit("inbound", "webhook.replay", "Rejected as a replay", { deliveryId: eventId });
      // Still apply checkout idempotency for same logical session even if event id differs —
      // for duplicate delivery of same event id, short-circuit.
      return NextResponse.json({ error: "replay rejected" }, { status: 401 });
    }
    world.seenInboundIds.add(eventId);
    world.inboundWebhookStats.accepted += 1;

    if (event.type !== "checkout.session.completed") {
      pushEvent(event.type ?? "stripe.event", { inbound: true }, { inbound: true, source: "inbound:stripe" });
      appendAudit("stripe", "webhook.ignored", `Ignored ${event.type ?? "unknown"}`);
      return NextResponse.json({ ok: true, handled: false, eventType: event.type, eventId });
    }

    const session = event.data?.object;
    const sessionId =
      session?.id ?? world.pendingStripeCheckout?.sessionId ?? world.stripeCheckoutSessionId ?? newId("cs");
    const signedIn =
      session?.metadata?.signedInUserId ??
      session?.metadata?.clawql_signed_in_user_id ??
      world.pendingStripeCheckout?.signedInUserId ??
      world.signedInUserId ??
      "user_dana";

    const result = provisionFromCheckout({
      signedInUserId: signedIn,
      sessionId,
      testCard: true,
    });

    pushEvent(
      "checkout.session.completed",
      { sessionId, provisioned: result.provisioned, replayIgnored: result.replayIgnored },
      { inbound: true, source: "inbound:stripe" },
    );

    return NextResponse.json({
      ok: true,
      handled: true,
      eventType: "checkout.session.completed",
      eventId,
      sessionId,
      inbound: "stripe",
      ...result,
      landOn: "/",
      stats: world.inboundWebhookStats,
    });
  });
}
