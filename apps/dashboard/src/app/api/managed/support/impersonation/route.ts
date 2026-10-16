import { Effect } from "effect";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isManagedConsole } from "@/lib/console-surface";
import {
  getActiveImpersonationEffect,
  startImpersonationEffect,
  stopImpersonationEffect,
} from "@/lib/managed/live/impersonation";
import { resolveManagedSessionSync } from "@/lib/managed/session";

export const runtime = "nodejs";

const COOKIE = "clawql-support-impersonation";

function sessionFromCookies(
  cookieStore: Awaited<ReturnType<typeof cookies>>
) {
  const accessToken =
    cookieStore.get("sb-access-token")?.value ??
    cookieStore.get("clawql-supabase-access-token")?.value ??
    null;
  return resolveManagedSessionSync({ accessToken });
}

export async function GET() {
  if (!isManagedConsole()) {
    return NextResponse.json({ error: "Managed console only" }, { status: 404 });
  }
  const cookieStore = await cookies();
  const session = sessionFromCookies(cookieStore);
  const active = await Effect.runPromise(getActiveImpersonationEffect(session.userId));
  return NextResponse.json({
    active,
    canImpersonate: /admin|owner/i.test(session.role),
    actor: {
      userId: session.userId,
      email: session.email,
      role: session.role,
    },
  });
}

export async function POST(req: Request) {
  if (!isManagedConsole()) {
    return NextResponse.json({ error: "Managed console only" }, { status: 404 });
  }
  const cookieStore = await cookies();
  const session = sessionFromCookies(cookieStore);
  const body = (await req.json().catch(() => ({}))) as {
    action?: "start" | "stop";
    targetUserId?: string;
    targetEmail?: string;
    targetDisplayName?: string;
    reason?: string;
  };

  if (body.action === "stop") {
    const ended = await Effect.runPromise(
      stopImpersonationEffect({
        actorUserId: session.userId,
        actorEmail: session.email,
      })
    );
    const res = NextResponse.json({ ok: true, ended });
    res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  if (body.action !== "start") {
    return NextResponse.json({ error: "action must be start or stop" }, { status: 400 });
  }

  const result = await Effect.runPromise(
    startImpersonationEffect({
      actor: session,
      targetUserId: body.targetUserId ?? "",
      targetEmail: body.targetEmail ?? "",
      targetDisplayName: body.targetDisplayName ?? body.targetEmail ?? "user",
      reason: body.reason ?? "",
    }).pipe(
      Effect.map((active) => ({ ok: true as const, active })),
      Effect.catch((err: { _tag: string; message: string }) =>
        Effect.succeed({
          ok: false as const,
          status: err._tag === "Forbidden" ? 403 : 400,
          error: err.message,
        })
      )
    )
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const res = NextResponse.json(result);
  res.cookies.set(COOKIE, result.active.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
