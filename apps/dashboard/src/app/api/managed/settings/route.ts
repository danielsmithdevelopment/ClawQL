import { Effect } from "effect";
import { NextResponse } from "next/server";

import { isManagedConsole } from "@/lib/console-surface";
import { getManagedSettingsEffect } from "@/lib/managed/live/settings";

export const runtime = "nodejs";

export async function GET() {
  if (!isManagedConsole()) {
    return NextResponse.json({ error: "Managed console only" }, { status: 404 });
  }
  const result = await Effect.runPromise(getManagedSettingsEffect());
  return NextResponse.json(result);
}
