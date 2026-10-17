import { Effect } from "effect";
import { NextResponse } from "next/server";

import { isManagedConsole } from "@/lib/console-surface";
import {
  issueManagedKeyEffect,
  listManagedKeysEffect,
  revokeManagedKeyEffect,
} from "@/lib/managed/live/keys";
import { resolveTrustedOrgIdEffect } from "@/lib/managed/org-scope";
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
    /** Rejected when present and not equal to the trusted session/env org (IDOR). */
    orgId?: string;
  };

  const session = resolveManagedSessionSync({});
  const orgResolved = await Effect.runPromise(
    resolveTrustedOrgIdEffect({
      sessionOrgId: session.orgId,
      clientOrgId: body.orgId,
    }).pipe(
      Effect.map((orgId) => ({ ok: true as const, orgId })),
      Effect.catchTag("OrgScopeError", () => Effect.succeed({ ok: false as const }))
    )
  );
  if (!orgResolved.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { orgId } = orgResolved;

  if (body.action === "revoke") {
    if (!body.keyId?.trim()) {
      return NextResponse.json({ error: "keyId required" }, { status: 400 });
    }
    const revokeResult = await Effect.runPromise(
      revokeManagedKeyEffect({ keyId: body.keyId.trim(), orgId }).pipe(
        Effect.map((value) => ({ ok: true as const, value })),
        Effect.catch((e) =>
          Effect.succeed({
            ok: false as const,
            reason:
              e && typeof e === "object" && "reason" in e
                ? String((e as { reason: string }).reason)
                : "Revoke failed",
          })
        )
      )
    );
    if (!revokeResult.ok) {
      if (revokeResult.reason === "org_mismatch") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.json({ error: "Revoke failed" }, { status: 400 });
    }
    return NextResponse.json(revokeResult.value);
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const exit = await Effect.runPromiseExit(
    issueManagedKeyEffect({
      name,
      subjectId: session.userId,
      orgId,
      teamId: body.teamId,
      scope: body.scope,
      expiresAt: body.expiresAt,
    })
  );
  if (exit._tag === "Failure") {
    return NextResponse.json(
      {
        error:
          "Issue failed — use CLAWQL_MANAGED_DATA_SOURCE=live (or auto) with a writable CLAWQL_HOME",
      },
      { status: 400 }
    );
  }
  return NextResponse.json(exit.value);
}
