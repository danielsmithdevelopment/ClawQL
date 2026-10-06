import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness } from "@/lib/managed/e2e/service";
import type { E2eAuditEntry } from "@/lib/managed/e2e/world";

function toOcsf(e: E2eAuditEntry) {
  return {
    class_uid: 3001,
    activity_id: 1,
    time: e.at,
    actor: { user: { name: e.actor } },
    metadata: {
      product: { name: "ClawQL Cloud" },
      uid: e.id,
      action: e.action,
      outcome: e.outcome,
    },
    unmapped: { prevHash: e.prevHash, hash: e.hash, hourlyRoot: e.hourlyRoot, meta: e.meta },
  };
}

/** GET /audit — production-shaped audit chain (+ optional ?format=ocsf). */
export function getAudit(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }
    const org = req.headers.get("x-org");
    if (org && org !== "acme" && org !== "org_acme") {
      // Cross-tenant: never reveal Acme existence (SEC-04)
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const world = yield* h.world();
    const chain = yield* h.verifyChain();
    const url = new URL(req.url);
    const format = url.searchParams.get("format");
    if (format === "ocsf") {
      return NextResponse.json({
        ocsf: world.audit.map(toOcsf),
        chain,
      });
    }
    return NextResponse.json({
      entries: world.audit,
      chain,
      hourlyRoots: world.hourlyRoots,
      auditBroken: world.auditBroken,
      alerts: world.alerts,
    });
  });
}
