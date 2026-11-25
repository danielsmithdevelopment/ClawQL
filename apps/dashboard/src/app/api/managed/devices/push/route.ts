import { Effect } from "effect";
import { NextResponse } from "next/server";

import { isManagedConsole } from "@/lib/console-surface";
import {
  clearManagedPushDevicesEffect,
  listManagedPushDevicesEffect,
  registerManagedPushDeviceEffect,
} from "@/lib/managed/live/devices-push";
import { requireManagedApiSession } from "@/lib/api-auth";

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
  const auth = await requireManagedApiSession(req);
  if (!auth.ok) return auth.response;

  const result = await Effect.runPromise(listManagedPushDevicesEffect());
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;
  const auth = await requireManagedApiSession(req);
  if (!auth.ok) return auth.response;


  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    platform?: "ios" | "android" | "web";
    label?: string;
    userId?: string;
    fixture?: boolean;
  };
  const session = auth.session;
  const platform = body.platform ?? "ios";
  if (!["ios", "android", "web"].includes(platform)) {
    return NextResponse.json({ error: "platform must be ios|android|web" }, { status: 400 });
  }

  try {
    const result = await Effect.runPromise(
      registerManagedPushDeviceEffect({
        token: body.token ?? "",
        platform,
        label: body.label,
        userId: body.userId ?? session.userId,
        fixture: body.fixture,
      }),
    );
    return NextResponse.json(result);
  } catch (cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const denied = guard();
  if (denied) return denied;
  const auth = await requireManagedApiSession(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId")?.trim();
  try {
    const result = await Effect.runPromise(clearManagedPushDevicesEffect({ userId }));
    return NextResponse.json(result);
  } catch (cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
