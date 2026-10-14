import { Effect } from "effect";
import { NextResponse } from "next/server";

import { isManagedConsole } from "@/lib/console-surface";
import { getManagedMemoryEffect, listManagedMemoryEffect } from "@/lib/managed/live/memory";

export const runtime = "nodejs";

function guard() {
  if (!isManagedConsole()) {
    return NextResponse.json({ error: "Managed console only" }, { status: 404 });
  }
  return null;
}

export async function GET(req: Request) {
  const denied = guard();
  if (denied) return denied;

  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim();
  if (id) {
    const result = await Effect.runPromise(getManagedMemoryEffect(id));
    if (!result.result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  }

  const query = url.searchParams.get("q") ?? undefined;
  const kind = url.searchParams.get("kind") ?? undefined;
  const listed = await Effect.runPromise(listManagedMemoryEffect({ query, kind }));
  return NextResponse.json(listed);
}
