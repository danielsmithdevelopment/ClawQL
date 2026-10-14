import { Effect } from "effect";
import { NextResponse } from "next/server";

import { isManagedConsole } from "@/lib/console-surface";
import {
  addManagedEvidenceEffect,
  listManagedEvidenceEffect,
  removeManagedEvidenceEffect,
  type ManagedEvidenceAttachment,
} from "@/lib/managed/live/evidence";

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
  const reviewId = new URL(req.url).searchParams.get("reviewId")?.trim();
  if (!reviewId) {
    return NextResponse.json({ error: "reviewId required" }, { status: 400 });
  }
  const result = await Effect.runPromise(listManagedEvidenceEffect({ reviewId }));
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as Partial<ManagedEvidenceAttachment> & {
    action?: string;
    attachmentId?: string;
  };

  if (body.action === "remove") {
    if (!body.reviewId?.trim() || !body.attachmentId?.trim()) {
      return NextResponse.json({ error: "reviewId and attachmentId required" }, { status: 400 });
    }
    try {
      const result = await Effect.runPromise(
        removeManagedEvidenceEffect({
          reviewId: body.reviewId.trim(),
          attachmentId: body.attachmentId.trim(),
        }),
      );
      return NextResponse.json(result);
    } catch (cause: unknown) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  const attachment = {
    id: body.id?.trim() ?? "",
    reviewId: body.reviewId?.trim() ?? "",
    uri: body.uri?.trim() ?? "",
    fileName: body.fileName?.trim() || "evidence.jpg",
    mimeType: body.mimeType?.trim() || "image/jpeg",
    source: body.source === "library" ? ("library" as const) : ("camera" as const),
    capturedAtMs: typeof body.capturedAtMs === "number" ? body.capturedAtMs : Date.now(),
    bytes: typeof body.bytes === "number" ? body.bytes : undefined,
  };

  try {
    const result = await Effect.runPromise(addManagedEvidenceEffect({ attachment }));
    return NextResponse.json(result);
  } catch (cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
