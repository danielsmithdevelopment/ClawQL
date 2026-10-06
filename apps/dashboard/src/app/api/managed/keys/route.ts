import { Effect } from "effect";
import { NextResponse } from "next/server";

import { isManagedConsole } from "@/lib/console-surface";
import { managedOrgId } from "@/lib/managed/data-source";
import {
  issueManagedKeyEffect,
  listManagedKeysEffect,
  revokeManagedKeyEffect,
} from "@/lib/managed/live/keys";
import { resolveManagedSessionSync } from "@/lib/managed/session";

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
  const result = await Effect.runPromise(listManagedKeysEffect());
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    name?: string;
    keyId?: string;
    scope?: string[];
    teamId?: string;
    expiresAt?: string;
  };

  const session = resolveManagedSessionSync({});

  if (body.action === "revoke") {
    if (!body.keyId?.trim()) {
      return NextResponse.json({ error: "keyId required" }, { status: 400 });
    }
    const exit = await Effect.runPromiseExit(revokeManagedKeyEffect({ keyId: body.keyId.trim() }));
    if (exit._tag === "Failure") {
      return NextResponse.json({ error: "Revoke failed" }, { status: 400 });
    }
    return NextResponse.json(exit.value);
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const exit = await Effect.runPromiseExit(
    issueManagedKeyEffect({
      name,
      subjectId: session.userId,
      orgId: managedOrgId() ?? session.orgId,
      teamId: body.teamId,
      scope: body.scope,
      expiresAt: body.expiresAt,
    }),
  );
  if (exit._tag === "Failure") {
    return NextResponse.json(
      {
        error:
          "Issue failed — use CLAWQL_MANAGED_DATA_SOURCE=live (or auto) with a writable CLAWQL_HOME",
      },
      { status: 400 },
    );
  }
  return NextResponse.json(exit.value);
}
