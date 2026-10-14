import { Effect } from "effect";
import { NextResponse } from "next/server";

import { isManagedConsole } from "@/lib/console-surface";
import {
  eraseManagedMemorySubjectEffect,
  getManagedMemoryEffect,
  listManagedMemoryEffect,
  listManagedMemoryUploadsEffect,
} from "@/lib/managed/live/memory";

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
  const view = url.searchParams.get("view")?.trim();
  if (view === "uploads") {
    const uploads = await Effect.runPromise(listManagedMemoryUploadsEffect());
    return NextResponse.json(uploads);
  }

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

export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    subject?: string;
    acceptIrreversible?: boolean;
    acceptAuditKept?: boolean;
  };

  if (body.action !== "erase") {
    return NextResponse.json({ error: "unsupported_action" }, { status: 400 });
  }

  try {
    const result = await Effect.runPromise(
      eraseManagedMemorySubjectEffect({
        subject: body.subject ?? "",
        acceptIrreversible: Boolean(body.acceptIrreversible),
        acceptAuditKept: Boolean(body.acceptAuditKept),
      }),
    );
    return NextResponse.json(result);
  } catch (cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    const reason = msg.includes("acceptance_required")
      ? "acceptance_required"
      : msg.includes("subject")
        ? "subject_required"
        : "erase_failed";
    return NextResponse.json({ error: reason, detail: msg }, { status: 400 });
  }
}
