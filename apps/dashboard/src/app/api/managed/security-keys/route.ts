import { Effect } from "effect";
import { NextResponse } from "next/server";

import { requireManagedApiSession, sessionCanApprove } from "@/lib/api-auth";
import { isManagedConsole } from "@/lib/console-surface";
import {
  issueEnrollChallengeEffect,
  listApproveCredentialsEffect,
  originFromRequest,
  rpIdFromRequest,
  verifyEnrollResponseEffect,
} from "@/lib/managed/approve-webauthn";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!isManagedConsole()) {
    return NextResponse.json({ error: "Managed console only" }, { status: 404 });
  }
  const auth = await requireManagedApiSession(req);
  if (!auth.ok) return auth.response;

  const keys = await Effect.runPromise(listApproveCredentialsEffect(auth.session.userId));
  return NextResponse.json({
    keys: keys.map((k) => ({
      id: k.credentialId,
      label: k.label ?? "Security key",
      canApprove: k.canApprove,
      enrolledAt: k.enrolledAt,
    })),
  });
}

export async function POST(req: Request) {
  if (!isManagedConsole()) {
    return NextResponse.json({ error: "Managed console only" }, { status: 404 });
  }
  const auth = await requireManagedApiSession(req);
  if (!auth.ok) return auth.response;
  const session = auth.session;

  if (!sessionCanApprove(session)) {
    return NextResponse.json(
      { error: "Approver role required to enroll an approval key" },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: "enroll_challenge" | "enroll_verify";
    response?: unknown;
    label?: string;
  };

  if (body.action === "enroll_challenge") {
    const exit = await Effect.runPromiseExit(
      issueEnrollChallengeEffect({
        userId: session.userId,
        userName: session.email,
        displayName: session.displayName,
        rpId: rpIdFromRequest(req),
      }),
    );
    if (exit._tag === "Failure") {
      return NextResponse.json({ error: "Could not issue enroll challenge" }, { status: 500 });
    }
    return NextResponse.json({ options: exit.value.options, challenge: exit.value.challenge });
  }

  if (body.action === "enroll_verify") {
    if (!body.response) {
      return NextResponse.json({ error: "response required" }, { status: 400 });
    }
    const exit = await Effect.runPromiseExit(
      verifyEnrollResponseEffect({
        userId: session.userId,
        response: body.response,
        rpId: rpIdFromRequest(req),
        origin: originFromRequest(req),
        label: body.label,
      }),
    );
    if (exit._tag === "Failure") {
      return NextResponse.json({ error: "Enroll verification failed" }, { status: 403 });
    }
    return NextResponse.json({
      ok: true,
      key: {
        id: exit.value.credentialId,
        label: exit.value.label,
        canApprove: exit.value.canApprove,
        enrolledAt: exit.value.enrolledAt,
      },
    });
  }

  return NextResponse.json(
    { error: "action must be enroll_challenge or enroll_verify" },
    { status: 400 },
  );
}
