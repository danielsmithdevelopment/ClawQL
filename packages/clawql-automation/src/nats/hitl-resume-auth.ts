/**
 * Audit 5.02 / W4: NATS `hitl.completed` must not resume Argo without a human
 * approve decision and a signed resume proof (HMAC over workflow + decision + ts).
 * The shared secret never travels in the JetStream payload.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
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

const MAX_RESUME_AGE_MS = 24 * 60 * 60 * 1000;

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

function workflowCanonical(envelope: WorkflowEventEnvelope): string {
  const ref = envelope.workflow_ref;
  if (ref && typeof ref === "object") {
    const ns = "namespace" in ref ? String((ref as { namespace?: string }).namespace ?? "") : "";
    const name = "name" in ref ? String((ref as { name?: string }).name ?? "") : "";
    if (ns || name) return `${ns}/${name}`;
  }
  return envelope.correlation_id?.trim() || "";
}

/** Canonical bytes for HMAC: workflow|decision|ts */
export function hitlResumeSignPayload(
  workflow: string,
  decision: string,
  ts: string
): string {
  return `${workflow}\n${decision}\n${ts}`;
}

export function signHitlResume(
  secret: string,
  workflow: string,
  decision: string,
  ts: string
): string {
  return createHmac("sha256", secret)
    .update(hitlResumeSignPayload(workflow, decision, ts), "utf8")
    .digest("hex");
}

function readPresentedSig(envelope: WorkflowEventEnvelope): string | undefined {
  const payload = envelope.payload;
  if (!payload || typeof payload !== "object") return undefined;
  const sig = payload.resume_sig;
  if (typeof sig === "string" && sig.trim()) return sig.trim();
  // Legacy: fixed secret in payload (pre-W4) — still accepted if it matches the HMAC secret string.
  const legacy = payload.resume_token;
  if (typeof legacy === "string" && legacy.trim()) return legacy.trim();
  const hitl = payload.clawql_hitl;
  if (hitl && typeof hitl === "object") {
    const t = (hitl as Record<string, unknown>).resume_sig;
    if (typeof t === "string" && t.trim()) return t.trim();
    const lt = (hitl as Record<string, unknown>).resume_token;
    if (typeof lt === "string" && lt.trim()) return lt.trim();
  }
  return undefined;
}

/**
 * Gate Argo resume from a NATS hitl.completed envelope.
 * Requires decision=approve and a matching HMAC resume_sig (or legacy resume_token)
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

    const expectedSecret = natsHitlResumeToken();
    if (!expectedSecret) {
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

    const presented = readPresentedSig(envelope) ?? "";
    if (!presented) {
      return { ok: false, error: "invalid or missing hitl resume_sig" };
    }

    // W4: preferred — HMAC(workflow|decision|envelope.ts)
    const workflow = workflowCanonical(envelope);
    const expectedSig = signHitlResume(expectedSecret, workflow, decision, envelope.ts);
    if (timingSafeEqualString(presented, expectedSig)) {
      const at = Date.parse(envelope.ts);
      if (Number.isFinite(at) && Date.now() - at > MAX_RESUME_AGE_MS) {
        return { ok: false, error: "hitl resume_sig expired" };
      }
      return { ok: true };
    }

    // Legacy: raw shared secret in payload (pre-W4) — accepted until publishers migrate.
    if (timingSafeEqualString(presented, expectedSecret)) {
      return { ok: true };
    }

    return { ok: false, error: "invalid or missing hitl resume_sig" };
  });
}

export function assertHitlCompletedMayResume(
  envelope: WorkflowEventEnvelope
): HitlResumeAuthResult {
  return Effect.runSync(assertHitlCompletedMayResumeEffect(envelope));
}
