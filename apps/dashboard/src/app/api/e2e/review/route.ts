import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness, runE2eEffect } from "@/lib/managed/e2e/service";
import { getWorld, recountReviewBadges } from "@/lib/managed/e2e/world";

export const dynamic = "force-dynamic";

/** Public Review list + badge counts (Home / sidebar / Review must agree). */
export async function GET() {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const world = getWorld();
      recountReviewBadges();
      const waiting = world.review.filter((r) => r.status === "waiting").length;
      return NextResponse.json({
        review: world.review.map((r) => ({
          id: r.id,
          kind: r.kind,
          title: r.title,
          requester: r.requester,
          digest: r.digest,
          args: r.args,
          status: r.status,
          approvers: r.approvers,
          expiresAt: r.expiresAt,
          mandateId: r.mandateId,
          before: r.args.before,
          after: r.args.annualValue ?? r.args.value,
        })),
        badges: {
          home: world.homeNeedsAction,
          review: world.reviewBadge,
          sidebar: world.sidebarBadge,
        },
        waiting,
      });
    }),
  );
}
