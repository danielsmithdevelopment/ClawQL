/**
 * Gateway lifecycle for Cloud E2E (restart preserves sessions/review).
 * Production-shaped POST /gateway/restart — RES-01 / RES-06 arrange + /audit Pass-when.
 */
import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness } from "@/lib/managed/e2e/service";
import { appendAudit, getWorld } from "@/lib/managed/e2e/world";

export function postGatewayRestart(_req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }
    const world = getWorld();
    world.gateUnreachable = false;
    appendAudit("gateway", "gateway.restart", "Restarted — sessions and review preserved", {
      sessionCount: world.sessions.length,
      reviewWaiting: world.review.filter((r) => r.status === "waiting").length,
    });
    return NextResponse.json({
      ok: true,
      sessionCount: world.sessions.length,
      reviewWaiting: world.review.filter((r) => r.status === "waiting").length,
    });
  });
}
