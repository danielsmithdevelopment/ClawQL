/**
 * Audit 5.02: NATS `hitl.completed` must not resume Argo without a human
 * approve decision and a shared resume token (unless unsigned resume is
 * explicitly allowed for local demos).
 */

import { timingSafeEqual } from "node:crypto";
import { Effect } from "effect";
import {
  natsHitlAllowUnsignedResume,
  natsHitlResumeToken,
} from "./env.js";
import type { WorkflowEventEnvelope } from "./envelope.js";

function timingSafeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export type HitlResumeAuthResult =
  | { ok: true }
  | { ok: false; error: string };

function readDecision(envelope: WorkflowEventEnvelope): string | undefined {
  const payload = envelope.payload;
  if (!payload || typeof payload !== "object") return undefined;
  const direct = payload.decision;
  if (typeof direct === "string") return direct.trim().toLowerCase();
  const hitl = payload.clawql_hitl;
  if (hitl && typeof hitl === "object") {
    const d = (hitl as Record<string, unknown>).decision;
    if (typeof d === "string") return d.trim().toLowerCase();
  }
  return undefined;
}

function readPresentedToken(envelope: WorkflowEventEnvelope): string | undefined {
  const payload = envelope.payload;
  if (!payload || typeof payload !== "object") return undefined;
  const direct = payload.resume_token;
  if (typeof direct === "string") return direct;
  const hitl = payload.clawql_hitl;
  if (hitl && typeof hitl === "object") {
    const t = (hitl as Record<string, unknown>).resume_token;
    if (typeof t === "string") return t;
  }
  return undefined;
}

/**
 * Gate Argo resume from a NATS hitl.completed envelope.
 * Requires decision=approve and a matching CLAWQL_NATS_HITL_RESUME_TOKEN
 * unless CLAWQL_NATS_HITL_ALLOW_UNSIGNED_RESUME=1.
 */
export function assertHitlCompletedMayResumeEffect(
  envelope: WorkflowEventEnvelope
): Effect.Effect<HitlResumeAuthResult> {
  return Effect.sync(() => {
    const decision = readDecision(envelope);
    if (decision !== "approve") {
      return {
        ok: false,
        error:
          decision === "decline" || decision === "reject"
            ? `hitl decision is ${decision}; not resuming`
            : "hitl.completed missing decision=approve (audit 5.02)",
      };
    }

    const expected = natsHitlResumeToken();
    if (!expected) {
      if (natsHitlAllowUnsignedResume()) {
        return { ok: true };
      }
      return {
        ok: false,
        error:
          "CLAWQL_NATS_HITL_RESUME_TOKEN is required for NATS hitl resume " +
          "(or set CLAWQL_NATS_HITL_ALLOW_UNSIGNED_RESUME=1 for local demos only)",
      };
    }

    const presented = readPresentedToken(envelope) ?? "";
    if (!presented || !timingSafeEqualString(presented, expected)) {
      return { ok: false, error: "invalid or missing hitl resume_token" };
    }
    return { ok: true };
  });
}

export function assertHitlCompletedMayResume(
  envelope: WorkflowEventEnvelope
): HitlResumeAuthResult {
  return Effect.runSync(assertHitlCompletedMayResumeEffect(envelope));
}
