import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness, runE2eEffect } from "@/lib/managed/e2e/service";

export const dynamic = "force-dynamic";

export async function GET() {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const world = yield* h.world();
      const chain = yield* h.verifyChain();
      return NextResponse.json({
        entries: world.audit,
        chain,
      });
    }),
  );
}
