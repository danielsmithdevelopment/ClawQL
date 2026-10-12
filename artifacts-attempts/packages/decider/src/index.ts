/**
 * Configurable /v1/decisions client — ClawQL gateway or OpenAI-compatible.
 * Missing `calibrated` is treated as false (OpenAI always → approval).
 */

import {
  shouldAutoMerge,
  type DecisionRequest,
  type DecisionResponse,
} from "@artifacts-attempts/shared";

export type DeciderConfig = {
  /** Full URL to POST (e.g. https://…/v1/decisions). */
  decisionsUrl: string;
  apiKey?: string;
  minConfidence?: number;
  model?: string;
};

export type WinnerMeta = {
  testsFailed: number;
  policyClean: boolean;
};

export type DecideOutcome = {
  decision: DecisionResponse;
  autoMerge: boolean;
  reason: string;
};

export async function fetchDecision(
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
    throw new Error(`decisions HTTP ${res.status}`);
  }
  const json = (await res.json()) as DecisionResponse & {
    // OpenAI Responses / chat shapes sometimes nest the answer
    output?: Array<{ content?: Array<{ text?: string }> }>;
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (json.winner || json.calibrated !== undefined || json.confidence !== undefined) {
    return {
      winner: json.winner,
      calibrated: json.calibrated,
      confidence: json.confidence,
      refusal: json.refusal,
    };
  }
  // Best-effort parse of free-form OpenAI content: look for att_N
  const text =
    json.choices?.[0]?.message?.content ??
    json.output?.flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("") ??
    "";
  const m = text.match(/\b(att_\d+)\b/);
  return {
    winner: m?.[1],
    // OpenAI path: calibrated omitted → false
    confidence: 0.5,
  };
}

export function applyDecision(
  decision: DecisionResponse,
  winnerMeta: WinnerMeta,
  minConfidence = 0.9
): DecideOutcome {
  const r = shouldAutoMerge({
    decision,
    winnerTestsFailed: winnerMeta.testsFailed,
    winnerPolicyClean: winnerMeta.policyClean,
    minConfidence,
  });
  return { decision, autoMerge: r.auto, reason: r.reason };
}

export async function decide(
  cfg: DeciderConfig,
  request: DecisionRequest,
  winnerMeta: WinnerMeta,
  fetchFn: typeof fetch = fetch
): Promise<DecideOutcome> {
  const decision = await fetchDecision(cfg, request, fetchFn);
  return applyDecision(decision, winnerMeta, cfg.minConfidence ?? 0.9);
}

export function buildWinnerRequest(input: {
  prompt: string;
  choices: Array<{ value: string; description: string }>;
  model?: string;
}): DecisionRequest {
  return {
    model: input.model ?? "clawql-auto",
    input: `Task: ${input.prompt}. Evidence per attempt follows.`,
    questions: [
      {
        type: "choice",
        name: "winner",
        instructions:
          "Which attempt best completes the task? Prefer passing tests, clean policy and smaller diffs.",
        choices: input.choices,
      },
    ],
  };
}

/** In-process stub for demos without a network decisions URL. */
export function localCalibratedDecision(winner: string, confidence = 0.96): DecisionResponse {
  return { winner, calibrated: true, confidence };
}

export function localOpenAIShapedDecision(winner: string): DecisionResponse {
  return { winner, confidence: 0.99 };
}
