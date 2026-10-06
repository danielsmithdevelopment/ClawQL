import { Effect } from "effect";
import { NextResponse } from "next/server";

import { isManagedConsole } from "@/lib/console-surface";
import { listManagedConnectionsEffect } from "@/lib/managed/live/connections";

export const runtime = "nodejs";

export async function GET() {
  if (!isManagedConsole()) {
    return NextResponse.json({ error: "Managed console only" }, { status: 404 });
  }
  const result = await Effect.runPromise(listManagedConnectionsEffect());
  return NextResponse.json(result);
}
