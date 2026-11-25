import { Effect } from "effect";
import { NextResponse } from "next/server";

import {
  mintApprovalProof,
  requireManagedApiSession,
  sessionCanApprove,
  verifyApprovalProof,
  type ApprovalProofInput,
} from "@/lib/api-auth";
import { isManagedConsole } from "@/lib/console-surface";
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

const NEEDS_APPROVER_PROOF: ReadonlySet<Decision> = new Set(["approve", "retry_with_key"]);

export async function GET(req: Request) {
  if (!isManagedConsole()) {
    return NextResponse.json({ error: "Managed console only" }, { status: 404 });
  }
  const auth = await requireManagedApiSession(req);
  if (!auth.ok) return auth.response;

  const result = await Effect.runPromise(listManagedReviewEffect());
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  if (!isManagedConsole()) {
    return NextResponse.json({ error: "Managed console only" }, { status: 404 });
  }

  const auth = await requireManagedApiSession(req);
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    kind?: "change" | "source";
    decision?: Decision;
    approvalProof?: ApprovalProofInput;
    mintProof?: boolean;
  };

  if (body.mintProof === true) {
    if (!body.id?.trim() || !body.kind || !body.decision) {
      return NextResponse.json({ error: "id, kind, and decision are required" }, { status: 400 });
    }
    if (!sessionCanApprove(session)) {
      return NextResponse.json({ error: "Approver role required" }, { status: 403 });
    }
    const proof = mintApprovalProof({
      session,
      id: body.id.trim(),
      kind: body.kind,
      decision: body.decision,
    });
    if (!proof) {
      return NextResponse.json(
        {
          error:
            "Cannot mint approval proof — configure CLAWQL_DASHBOARD_APPROVE_HMAC_SECRET or sign in",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({
      approvalProof: { method: "session_hmac", attestation: proof },
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

  if (NEEDS_APPROVER_PROOF.has(body.decision)) {
    if (!sessionCanApprove(session)) {
      return NextResponse.json({ error: "Approver role required" }, { status: 403 });
    }
    if (
      !verifyApprovalProof({
        session,
        id: body.id.trim(),
        kind: body.kind,
        decision: body.decision,
        approvalProof: body.approvalProof,
      })
    ) {
      return NextResponse.json(
        { error: "Security key / approval proof required" },
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
