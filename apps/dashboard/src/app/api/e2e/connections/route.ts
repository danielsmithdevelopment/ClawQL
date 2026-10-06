import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness, runE2eEffect } from "@/lib/managed/e2e/service";
import { getWorld } from "@/lib/managed/e2e/world";

export const dynamic = "force-dynamic";

/** Public connections list for catalog Pass-when (not control/getWitness). */
export async function GET() {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const world = getWorld();
      return NextResponse.json({
        connections: world.connections.map((c) => ({
          id: c.id,
          name: c.name,
          groups: c.groups,
          status: c.status,
          personal: c.personal ?? false,
          kind: c.kind,
          readOverrides: c.readOverrides ?? [],
        })),
      });
    }),
  );
}
