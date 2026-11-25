import { Effect } from "effect";
import { NextResponse } from "next/server";

import { isManagedConsole } from "@/lib/console-surface";
import { listManagedConnectionsEffect } from "@/lib/managed/live/connections";

import { requireManagedApiSession } from "@/lib/api-auth";
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!isManagedConsole()) {
    return NextResponse.json({ error: "Managed console only" }, { status: 404 });
  }
  const auth = await requireManagedApiSession(req);
  if (!auth.ok) return auth.response;

  const result = await Effect.runPromise(listManagedConnectionsEffect());
  return NextResponse.json(result);
}
