import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness, runE2eEffect } from "@/lib/managed/e2e/service";

export const dynamic = "force-dynamic";

/** Companion to /decision — score questions return 400 (GW-13). */
export async function POST(req: Request) {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const body = (yield* Effect.tryPromise({
        try: () => req.json() as Promise<{ question?: string; text?: string }>,
        catch: () => ({}),
      })) as { question?: string; text?: string };
      const q = `${body.question ?? ""} ${body.text ?? ""}`.toLowerCase();
      if (/\bscore\b/.test(q)) {
        return NextResponse.json(
          { error: "use choice or noul", message: "use choice or noul" },
          { status: 400 },
        );
      }
      return NextResponse.json({ ok: true, system: "one" });
    }),
  );
}
