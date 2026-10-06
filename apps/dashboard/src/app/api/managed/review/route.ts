import { Effect } from "effect";
import { NextResponse } from "next/server";

import { isManagedConsole } from "@/lib/console-surface";
import { decideManagedReviewEffect, listManagedReviewEffect } from "@/lib/managed/live/review";
import { resolveManagedSessionSync } from "@/lib/managed/session";

export const runtime = "nodejs";

export async function GET() {
  if (!isManagedConsole()) {
    return NextResponse.json({ error: "Managed console only" }, { status: 404 });
  }
  const result = await Effect.runPromise(listManagedReviewEffect());
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  if (!isManagedConsole()) {
    return NextResponse.json({ error: "Managed console only" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    kind?: "change" | "source";
    decision?: "approve" | "decline";
  };

  if (!body.id?.trim() || !body.kind || !body.decision) {
    return NextResponse.json({ error: "id, kind, and decision are required" }, { status: 400 });
  }
  if (body.kind !== "change" && body.kind !== "source") {
    return NextResponse.json({ error: "kind must be change or source" }, { status: 400 });
  }
  if (body.decision !== "approve" && body.decision !== "decline") {
    return NextResponse.json({ error: "decision must be approve or decline" }, { status: 400 });
  }

  const session = resolveManagedSessionSync({});
  const exit = await Effect.runPromiseExit(
    decideManagedReviewEffect({
      id: body.id.trim(),
      kind: body.kind,
      decision: body.decision,
      operatorId: session.userId,
    }),
  );
  if (exit._tag === "Failure") {
    return NextResponse.json(
      { error: "Decision failed — check pending id and operator two-party rules" },
      { status: 400 },
    );
  }
  return NextResponse.json(exit.value);
}
