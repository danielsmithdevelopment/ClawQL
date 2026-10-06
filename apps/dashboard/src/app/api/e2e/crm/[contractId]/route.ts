import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness, runE2eEffect } from "@/lib/managed/e2e/service";
import { getWorld } from "@/lib/managed/e2e/world";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ contractId: string }> },
) {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const { contractId } = yield* Effect.tryPromise({
        try: () => ctx.params,
        catch: () => ({ contractId: "" }),
      });
      const row = getWorld().crm[contractId];
      if (!row) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      return NextResponse.json({
        id: contractId,
        counterparty: row.counterparty,
        annualValue: row.annualValue,
        display: `$${row.annualValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      });
    }),
  );
}
