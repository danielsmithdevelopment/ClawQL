import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness, runE2eEffect } from "@/lib/managed/e2e/service";
import { getWorld } from "@/lib/managed/e2e/world";

export const dynamic = "force-dynamic";

/** Spend snapshot for ADM-06 / ADM-09 budget witnesses. */
export async function GET() {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const world = getWorld();
      return NextResponse.json({
        monthSpentCents: world.monthSpentCents,
        monthBudgetCents: world.monthBudgetCents,
        hardStop: world.hardStop,
        creditsCents: world.creditsCents,
        teamBudgets: world.teamBudgets,
        keys: world.keys.map((k) => ({
          name: k.name,
          group: k.group,
          spentTodayCents: k.spentTodayCents,
          dailyCapCents: k.dailyCapCents,
        })),
      });
    }),
  );
}
