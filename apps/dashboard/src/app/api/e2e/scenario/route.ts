import { Effect } from "effect";
import { NextResponse } from "next/server";

import {
  CATALOG_RUNNER_IDS,
  runCatalogScenario,
  runnerCount,
} from "@/lib/managed/e2e/catalog-runners";
import { E2eHarness, runE2eEffect } from "@/lib/managed/e2e/service";

export const dynamic = "force-dynamic";

/** POST { id } — run a self-contained pass-when check for a catalog scenario. */
export async function POST(req: Request) {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const body = (yield* Effect.tryPromise({
        try: () => req.json() as Promise<{ id?: string }>,
        catch: () => ({}),
      })) as { id?: string };
      const id = body.id ?? "";
      if (!id) {
        return NextResponse.json({ error: "id required", runners: runnerCount() }, { status: 400 });
      }
      const result = yield* runCatalogScenario(id);
      return NextResponse.json(result, { status: result.ok ? 200 : 422 });
    }),
  );
}

export async function GET() {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      return NextResponse.json({
        runners: runnerCount(),
        ids: CATALOG_RUNNER_IDS,
      });
    }),
  );
}
