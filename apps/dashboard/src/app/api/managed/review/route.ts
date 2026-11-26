import { Effect } from "effect";
import { NextResponse } from "next/server";

import {
  isE2eApprovalProof,
  isWebAuthnApprovalProof,
  requireManagedOrgSession,
  sessionCanApprove,
  type ApprovalProofInput,
} from "@/lib/api-auth";
import { isManagedConsole } from "@/lib/console-surface";
import {
  issueApproveChallengeEffect,
  originFromRequest,
  resolveReviewChangeHashEffect,
  rpIdFromRequest,
  verifyApproveAssertionEffect,
} from "@/lib/managed/approve-webauthn";
import { decideManagedReviewEffect, listManagedReviewEffect } from "@/lib/managed/live/review";

export const runtime = "nodejs";

const DECISIONS = [
  "approve",
  "decline",
  "mark_applied",
  "mark_not_applied",
  "retry_with_key",
] as const;

type Decision = (typeof DECISIONS)[number];

const NEEDS_WEBAUTHN: ReadonlySet<Decision> = new Set(["approve", "retry_with_key"]);

function failureMessage(exit: { _tag: "Failure"; cause: unknown }): string {
  const c = exit.cause as { _tag?: string; failure?: { message?: string }; message?: string };
  if (c && typeof c === "object") {
    if (typeof c.failure?.message === "string") return c.failure.message;
    if (typeof c.message === "string") return c.message;
  }
  return "challenge_failed";
}

export async function GET(req: Request) {
  if (!isManagedConsole()) {
    return NextResponse.json({ error: "Managed console only" }, { status: 404 });
  }
  const auth = await requireManagedOrgSession(req);
  if (!auth.ok) return auth.response;

  const result = await Effect.runPromise(
    listManagedReviewEffect({ orgId: auth.session.orgId }),
  );
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  if (!isManagedConsole()) {
    return NextResponse.json({ error: "Managed console only" }, { status: 404 });
  }

  const auth = await requireManagedOrgSession(req);
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    kind?: "change" | "source";
    decision?: Decision;
    approvalProof?: ApprovalProofInput;
    action?: "approve_challenge";
  };

  if (body.action === "approve_challenge") {
    if (!body.id?.trim() || !body.kind || !body.decision) {
      return NextResponse.json({ error: "id, kind, and decision are required" }, { status: 400 });
    }
    if (!sessionCanApprove(session)) {
      return NextResponse.json({ error: "Approver role required" }, { status: 403 });
    }
    if (!NEEDS_WEBAUTHN.has(body.decision)) {
      return NextResponse.json(
        { error: "WebAuthn challenge is only for approve / retry_with_key" },
        { status: 400 },
      );
    }
    const hashExit = await Effect.runPromiseExit(
      resolveReviewChangeHashEffect({
        reviewId: body.id.trim(),
        kind: body.kind,
        orgId: session.orgId,
      }),
    );
    if (hashExit._tag === "Failure") {
      return NextResponse.json(
        { error: "Could not resolve change hash for this review item", detail: failureMessage(hashExit) },
        { status: 400 },
      );
    }
    const exit = await Effect.runPromiseExit(
      issueApproveChallengeEffect({
        userId: session.userId,
        reviewId: body.id.trim(),
        kind: body.kind,
        decision: body.decision,
        changeHash: hashExit.value,
        rpId: rpIdFromRequest(req),
        orgId: session.orgId,
      }),
    );
    if (exit._tag === "Failure") {
      const reason = failureMessage(exit);
      const msg = reason.includes("no_passkey")
        ? "Register a passkey before approving"
        : "Could not issue approval challenge";
      return NextResponse.json({ error: msg, detail: reason }, { status: 403 });
    }
    return NextResponse.json({
      options: exit.value.options,
      challenge: exit.value.challenge,
      changeHash: hashExit.value,
    });
  }

  if (!body.id?.trim() || !body.kind || !body.decision) {
    return NextResponse.json({ error: "id, kind, and decision are required" }, { status: 400 });
  }
  if (body.kind !== "change" && body.kind !== "source") {
    return NextResponse.json({ error: "kind must be change or source" }, { status: 400 });
  }
  if (!DECISIONS.includes(body.decision)) {
    return NextResponse.json(
      { error: `decision must be one of: ${DECISIONS.join(", ")}` },
      { status: 400 },
    );
  }

  if (NEEDS_WEBAUTHN.has(body.decision)) {
    if (!sessionCanApprove(session)) {
      return NextResponse.json({ error: "Approver role required" }, { status: 403 });
    }

    if (isE2eApprovalProof(body.approvalProof)) {
      // CLAWQL_E2E_HARNESS=1 only
    } else if (isWebAuthnApprovalProof(body.approvalProof)) {
      const hashExit = await Effect.runPromiseExit(
        resolveReviewChangeHashEffect({
          reviewId: body.id.trim(),
          kind: body.kind,
          orgId: session.orgId,
        }),
      );
      if (hashExit._tag === "Failure") {
        return NextResponse.json(
          { error: "Could not resolve change hash for this review item" },
          { status: 400 },
        );
      }
      const verifyExit = await Effect.runPromiseExit(
        verifyApproveAssertionEffect({
          userId: session.userId,
          reviewId: body.id.trim(),
          kind: body.kind,
          decision: body.decision,
          changeHash: hashExit.value,
          response: body.approvalProof.response,
          rpId: rpIdFromRequest(req),
          origin: originFromRequest(req),
          orgId: session.orgId,
        }),
      );
      if (verifyExit._tag === "Failure") {
        return NextResponse.json(
          { error: "Passkey assertion failed", detail: "webauthn_verify_failed" },
          { status: 403 },
        );
      }
    } else {
      return NextResponse.json(
        {
          error:
            "Passkey required — request an approve_challenge and submit a WebAuthn assertion",
        },
        { status: 403 },
      );
    }
  }

  const exit = await Effect.runPromiseExit(
    decideManagedReviewEffect({
      id: body.id.trim(),
      kind: body.kind,
      decision: body.decision,
      operatorId: session.userId,
      orgId: session.orgId,
    }),
  );
  if (exit._tag === "Failure") {
    return NextResponse.json(
      {
        error:
          "Decision failed — check pending id, outcome_unknown resolve rules, or operator two-party rules",
      },
      { status: 400 },
    );
  }
  return NextResponse.json(exit.value);
}
