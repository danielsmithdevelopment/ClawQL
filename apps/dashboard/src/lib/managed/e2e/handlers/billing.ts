/**
 * Billing / usage for Cloud E2E (credits, card, spend snapshot).
 * Production-shaped GET /billing/usage + POST /billing/credits|card.
 */
import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness } from "@/lib/managed/e2e/service";
import { appendAudit, getWorld } from "@/lib/managed/e2e/world";

export function usageSnapshot() {
  const world = getWorld();
  return {
    monthSpentCents: world.monthSpentCents,
    monthBudgetCents: world.monthBudgetCents,
    hardStop: world.hardStop,
    creditsCents: world.creditsCents,
    teamBudgets: world.teamBudgets,
    invoiceCard: world.invoiceCard,
    invoices: world.invoices,
    alerts: world.alerts,
    forecast: world.alerts.find((a) => a.kind === "budget-forecast")
      ? { warn: true, likelyDate: "2026-10-20" }
      : null,
    keys: world.keys.map((k) => ({
      name: k.name,
      group: k.group,
      spentTodayCents: k.spentTodayCents,
      dailyCapCents: k.dailyCapCents,
      capReached: k.spentTodayCents >= k.dailyCapCents,
      teamBudgetExhausted: k.teamBudgetExhausted ?? false,
      expiresAt: k.expiresAt,
    })),
    modelRoutes: Object.fromEntries(
      Object.entries(world.modelRoutes).map(([alias, r]) => [
        alias,
        {
          usingFallback: r.usingFallback,
          fallbackCount: r.fallbackCount,
          private: r.private,
          routeStatus: r.usingFallback ? "Using fallback" : "Primary",
        },
      ]),
    ),
  };
}

export function getBillingUsage(_req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }
    return NextResponse.json(usageSnapshot());
  });
}

export function postBillingCredits(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }
    const body = (yield* Effect.tryPromise({
      try: () => req.json() as Promise<{ cents?: number }>,
      catch: () => ({}),
    })) as { cents?: number };
    const cents = typeof body.cents === "number" ? body.cents : 0;
    if (cents <= 0) {
      return NextResponse.json({ error: "cents must be positive" }, { status: 400 });
    }
    const world = getWorld();
    world.creditsCents += cents;
    appendAudit("Dana Reyes", "billing.credits", "Added", { cents });
    return NextResponse.json({ ok: true, creditsCents: world.creditsCents });
  });
}

export function postBillingCard(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }
    const body = (yield* Effect.tryPromise({
      try: () => req.json() as Promise<{ lastFour?: string }>,
      catch: () => ({}),
    })) as { lastFour?: string };
    const lastFour = body.lastFour?.trim();
    if (!lastFour) {
      return NextResponse.json({ error: "lastFour required" }, { status: 400 });
    }
    const world = getWorld();
    world.invoiceCard = lastFour;
    appendAudit("Dana Reyes", "billing.card", "Changed", { lastFour });
    return NextResponse.json({ ok: true, invoiceCard: world.invoiceCard });
  });
}
