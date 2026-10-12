/**
 * Workflow per push: run tests (Sandbox / @cloudflare/ci), policy check, write Git note.
 * Idempotent on repo+commit.
 */

import { sealEvidenceNote, type EvidenceNote } from "@artifacts-attempts/notes";

export type EvalInput = {
  type: "push";
  repo: string;
  commit: string;
  at: string;
  taskId: string;
  attemptId: string;
  agent: { client: string; model: string };
  prevHash: string | null;
};

export type EvalResult = {
  note: EvidenceNote;
  blocked: boolean;
  duplicate: boolean;
};

const seen = new Set<string>();

/** Policy: any egress host not in allowlist → blocked. */
export function checkPolicy(hostsTouched: string[], allowlist: string[]): { clean: boolean; violations: string[] } {
  const violations = hostsTouched.filter((h) => !allowlist.some((a) => h === a || h.startsWith(a)));
  return { clean: violations.length === 0, violations: violations.map((h) => `egress:${h}`) };
}

export function evaluatePush(
  input: EvalInput,
  evidence: {
    tests: { passed: number; failed: number; command: string };
    hostsTouched: string[];
    allowlist: string[];
    diff: { insertions: number; deletions: number };
  }
): EvalResult {
  const key = `${input.repo}:${input.commit}`;
  if (seen.has(key)) {
    return {
      duplicate: true,
      blocked: false,
      note: sealEvidenceNote({
        schema: "artifacts-attempts.evidence/v1",
        taskId: input.taskId,
        attemptId: input.attemptId,
        repo: input.repo,
        commit: input.commit,
        evaluatedAt: input.at,
        agent: input.agent,
        tests: evidence.tests,
        policy: { clean: true, violations: [] },
        diff: evidence.diff,
        prev: input.prevHash,
      }),
    };
  }
  seen.add(key);
  const policy = checkPolicy(evidence.hostsTouched, evidence.allowlist);
  const note = sealEvidenceNote({
    schema: "artifacts-attempts.evidence/v1",
    taskId: input.taskId,
    attemptId: input.attemptId,
    repo: input.repo,
    commit: input.commit,
    evaluatedAt: input.at,
    agent: input.agent,
    tests: evidence.tests,
    policy,
    diff: evidence.diff,
    prev: input.prevHash,
  });
  return { note, blocked: !policy.clean, duplicate: false };
}

export function resetEvalIdempotencyForTests(): void {
  seen.clear();
}

export default {
  async fetch(): Promise<Response> {
    return new Response("evaluator workflow — bind via intake", { status: 501 });
  },
};
