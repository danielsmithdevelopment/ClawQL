import { Effect } from "effect";
import { NextResponse } from "next/server";

import { isManagedConsole } from "@/lib/console-surface";
import { listManagedAutomationsEffect } from "@/lib/managed/live/automations";

export const runtime = "nodejs";

export async function GET() {
  if (!isManagedConsole()) {
    return NextResponse.json({ error: "Managed console only" }, { status: 404 });
  }
  const result = await Effect.runPromise(listManagedAutomationsEffect());
  return NextResponse.json(result);
}
