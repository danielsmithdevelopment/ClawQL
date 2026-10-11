import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness, runE2eEffect } from "@/lib/managed/e2e/service";

export const dynamic = "force-dynamic";

/** Reset Acme fixture world before each catalog scenario. */
export async function POST() {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const world = yield* h.reset();
      return NextResponse.json({
        ok: true,
        orgId: world.orgId,
        review: world.review.length,
        keys: world.keys.length,
        audit: world.audit.length,
      });
    }),
  );
}
