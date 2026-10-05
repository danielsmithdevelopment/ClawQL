/**
 * Trusted module: mint RecentSignIn for account deletion / offboard.
 */

import { defineProof, type Named, type Proof, type UserId } from "clawql-gdp";
import { Effect } from "effect";

const RecentSignInProver = defineProof("RecentSignIn");

export interface RecentSignIn<U> extends Proof<"RecentSignIn", [U]> {
  /** Nominal brand for distinct proof kinds; never set at runtime. */
  readonly __proofBrand?: "RecentSignIn";
}

export type RecentSignInEvidence = {
  readonly subjectId: string;
  /** ISO timestamp of last interactive auth (password / MFA / step-up). */
  readonly authenticatedAt: string;
  /** Max age in seconds (default 5 minutes). */
  readonly maxAgeSeconds?: number;
};

export function recentSignInEffect<U>(
  user: Named<U, UserId>,
  evidence: RecentSignInEvidence,
  nowMs: number = Date.now()
): Effect.Effect<RecentSignIn<U> | null> {
  return Effect.sync(() => {
    if (evidence.subjectId.trim() !== user.value) return null;
    const at = Date.parse(evidence.authenticatedAt);
    if (!Number.isFinite(at)) return null;
    const maxAge = (evidence.maxAgeSeconds ?? 300) * 1000;
    if (nowMs - at > maxAge || at > nowMs + 60_000) return null;
    return RecentSignInProver.prove(user) as RecentSignIn<U>;
  });
}
