import { Effect } from "effect";
import { NextResponse } from "next/server";

import { isManagedConsole } from "@/lib/console-surface";
import { createManagedPortalSessionEffect } from "@/lib/managed/live/billing-portal";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isManagedConsole()) {
    return NextResponse.json({ error: "Managed console only" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { returnUrl?: string };
  const requestUrl = new URL(req.url);
  const returnUrl =
    body.returnUrl?.trim() ||
    process.env.CLAWQL_CPC_DASHBOARD_RETURN_URL?.trim() ||
    `${requestUrl.origin}/usage`;

  const result = await Effect.runPromise(
    createManagedPortalSessionEffect({ returnUrl }).pipe(
      Effect.map((value) => ({ ok: true as const, ...value })),
      Effect.catch((err: { readonly reason?: string }) =>
        Effect.succeed({
          ok: false as const,
          error:
            err?.reason ||
            "Portal session failed — set CLAWQL_STRIPE_CUSTOMER_ID with Stripe configured",
        }),
      ),
    ),
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({
    url: result.url,
    customerId: result.customerId,
    source: result.source,
  });
}
