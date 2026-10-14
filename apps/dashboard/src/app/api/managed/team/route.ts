import { Effect } from "effect";
import { NextResponse } from "next/server";

import { isManagedConsole } from "@/lib/console-surface";
import {
  inviteManagedTeamPersonEffect,
  listManagedTeamEffect,
} from "@/lib/managed/live/team";

export const runtime = "nodejs";

function guard() {
  if (!isManagedConsole()) {
    return NextResponse.json({ error: "Managed console only" }, { status: 404 });
  }
  return null;
}

export async function GET() {
  const denied = guard();
  if (denied) return denied;
  const result = await Effect.runPromise(listManagedTeamEffect());
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    name?: string;
    role?: string;
    acceptCanApprove?: boolean;
    acceptSecurityKeys?: boolean;
    acceptAuditRecorded?: boolean;
  };

  try {
    const result = await Effect.runPromise(
      inviteManagedTeamPersonEffect({
        email: body.email ?? "",
        name: body.name,
        role: body.role,
        acceptCanApprove: body.acceptCanApprove,
        acceptSecurityKeys: body.acceptSecurityKeys,
        acceptAuditRecorded: body.acceptAuditRecorded,
      }),
    );
    return NextResponse.json(result);
  } catch (cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    const reason = msg.includes("already_invited")
      ? "already_invited"
      : msg.includes("required")
        ? "acceptance_required"
        : "invite_failed";
    return NextResponse.json({ error: reason, detail: msg }, { status: 400 });
  }
}
