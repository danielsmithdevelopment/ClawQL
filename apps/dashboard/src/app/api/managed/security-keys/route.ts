import { Effect } from "effect";
import { NextResponse } from "next/server";

import {
  requireManagedOrgSession,
  sessionCanApprove,
} from "@/lib/api-auth";
import { isManagedConsole } from "@/lib/console-surface";
import {
  accessTokenAuthTimeSec,
  issueEnrollChallengeEffect,
  issueEnrollGateChallengeEffect,
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
  const auth = await requireManagedOrgSession(req);
  if (!auth.ok) return auth.response;

  const keys = await Effect.runPromise(listApproveCredentialsEffect(auth.session.userId));
  return NextResponse.json({
    keys: keys.map((k) => ({
      id: k.credentialId,
      label: k.label ?? "Passkey",
      canApprove: k.canApprove,
      enrolledAt: k.enrolledAt,
    })),
    wording:
      "Passkeys (WebAuthn). Without a FIDO attestation allowlist these are not claimed device-bound.",
  });
}

export async function POST(req: Request) {
  if (!isManagedConsole()) {
    return NextResponse.json({ error: "Managed console only" }, { status: 404 });
  }
  const auth = await requireManagedOrgSession(req);
  if (!auth.ok) return auth.response;
  const session = auth.session;

  if (!sessionCanApprove(session)) {
    return NextResponse.json(
      { error: "Approver role required to enroll a passkey" },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: "enroll_gate_challenge" | "enroll_challenge" | "enroll_verify";
    response?: unknown;
    gateResponse?: unknown;
    label?: string;
  };

  const rpId = rpIdFromRequest(req);
  const origin = originFromRequest(req);

  if (body.action === "enroll_gate_challenge") {
    const exit = await Effect.runPromiseExit(
      issueEnrollGateChallengeEffect({
        userId: session.userId,
        rpId,
      }),
    );
    if (exit._tag === "Failure") {
      return NextResponse.json(
        {
          error:
            "Could not issue enroll gate challenge — enroll a first passkey after a fresh sign-in if you have none yet",
        },
        { status: 403 },
      );
    }
    return NextResponse.json({ options: exit.value.options, challenge: exit.value.challenge });
  }

  if (body.action === "enroll_challenge") {
    const exit = await Effect.runPromiseExit(
      issueEnrollChallengeEffect({
        userId: session.userId,
        userName: session.email,
        displayName: session.displayName,
        rpId,
        origin,
        gateResponse: body.gateResponse,
        authTimeSec:
          accessTokenAuthTimeSec(session.accessToken) ??
          (session.mode === "mock" ? Math.floor(Date.now() / 1000) : undefined),
      }),
    );
    if (exit._tag === "Failure") {
      const detail =
        exit.cause && typeof exit.cause === "object" && "failure" in exit.cause
          ? String((exit.cause as { failure?: { message?: string } }).failure?.message ?? "")
          : "";
      const msg = detail.includes("recent_sign_in")
        ? "Sign in again before enrolling your first passkey"
        : detail.includes("existing_passkey")
          ? "Prove an enrolled passkey first (enroll_gate_challenge)"
          : "Could not issue enroll challenge";
      return NextResponse.json({ error: msg, detail: detail || undefined }, { status: 403 });
    }
    return NextResponse.json({
      options: exit.value.options,
      challenge: exit.value.challenge,
      firstKey: exit.value.firstKey,
    });
  }

  if (body.action === "enroll_verify") {
    if (!body.response) {
      return NextResponse.json({ error: "response required" }, { status: 400 });
    }
    const exit = await Effect.runPromiseExit(
      verifyEnrollResponseEffect({
        userId: session.userId,
        email: session.email,
        orgId: session.orgId,
        response: body.response,
        rpId,
        origin,
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
    { error: "action must be enroll_gate_challenge, enroll_challenge, or enroll_verify" },
    { status: 400 },
  );
}
