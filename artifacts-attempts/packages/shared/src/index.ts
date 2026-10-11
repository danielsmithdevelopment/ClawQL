/** Pipeline data contracts — must stay aligned with the competition design doc. */

export type TaskStatus =
  | "open"
  | "evaluating"
  | "deciding"
  | "awaiting_approval"
  | "merging"
  | "released"
  | "failed";

export type Task = {
  id: string;
  repo: string;
  baseCommit: string;
  prompt: string;
  attempts: number;
  status: TaskStatus;
};

export type AttemptStatus = "working" | "evaluated" | "blocked" | "won" | "stood_down";

export type Attempt = {
  id: string;
  taskId: string;
  fork: string;
  agent: { client: string; model: string };
  latestCommit?: string;
  status: AttemptStatus;
};

export type PushQueueMessage = {
  type: "push";
  repo: string;
  commit: string;
  at: string;
};

export type OutcomeUnknownResolve = never; // placeholder — not used in this entry

export type DecisionChoice = {
  value: string;
  description: string;
};

export type DecisionRequest = {
  model: string;
  input: string;
  questions: Array<{
    type: "choice";
    name: "winner";
    instructions: string;
    choices: DecisionChoice[];
  }>;
};

export type DecisionResponse = {
  winner?: string;
  calibrated?: boolean;
  confidence?: number;
  refusal?: boolean;
};

/** Trust rule: auto-merge only when all hold; otherwise approval page. */
export function shouldAutoMerge(input: {
  decision: DecisionResponse;
  winnerTestsFailed: number;
  winnerPolicyClean: boolean;
  minConfidence?: number;
}): { auto: boolean; reason: string } {
  const min = input.minConfidence ?? 0.9;
  if (input.decision.refusal === true) {
    return { auto: false, reason: "refusal" };
  }
  if (input.decision.calibrated !== true) {
    return { auto: false, reason: "uncalibrated" };
  }
  if (typeof input.decision.confidence !== "number" || input.decision.confidence < min) {
    return { auto: false, reason: "low_confidence" };
  }
  if (input.winnerTestsFailed !== 0) {
    return { auto: false, reason: "tests_failed" };
  }
  if (!input.winnerPolicyClean) {
    return { auto: false, reason: "policy_blocked" };
  }
  if (!input.decision.winner) {
    return { auto: false, reason: "no_winner" };
  }
  return { auto: true, reason: "calibrated_confident" };
}
