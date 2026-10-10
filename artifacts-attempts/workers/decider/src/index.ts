/**
 * Calls configurable /v1/decisions (ClawQL or OpenAI-compatible) and applies the trust rule.
 */

import { shouldAutoMerge, type DecisionRequest, type DecisionResponse } from "@artifacts-attempts/shared";

export type DeciderConfig = {
  decisionsUrl: string;
  apiKey?: string;
  minConfidence?: number;
};

export async function requestDecision(
  cfg: DeciderConfig,
  body: DecisionRequest,
  fetchFn: typeof fetch = fetch
): Promise<DecisionResponse> {
  const res = await fetchFn(cfg.decisionsUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`decisions ${res.status}`);
  }
  return (await res.json()) as DecisionResponse;
}

export function applyTrustRule(
  decision: DecisionResponse,
  winnerMeta: { testsFailed: number; policyClean: boolean },
  minConfidence = 0.9
): { autoMerge: boolean; reason: string; winner?: string } {
  const r = shouldAutoMerge({
    decision,
    winnerTestsFailed: winnerMeta.testsFailed,
    winnerPolicyClean: winnerMeta.policyClean,
    minConfidence,
  });
  return { autoMerge: r.auto, reason: r.reason, winner: decision.winner };
}

export default {
  async fetch(): Promise<Response> {
    return new Response("decider", { status: 501 });
  },
};
