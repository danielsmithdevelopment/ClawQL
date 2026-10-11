import { describe, expect, it } from "vitest";
import { evaluateApprovalPolicy, type ApprovalActionClass } from "./approval-policy.js";
import { leanOracleEvaluateApproval } from "./approval-policy-oracle.js";

const ACTIONS: ApprovalActionClass[] = ["read", "write", "delete", "payment"];

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("approval policy ↔ Lean oracle differential", () => {
  it("agrees on 5000 random policies and requests", () => {
    const rnd = mulberry32(0xc1a0);
    const people = ["alice", "bob", "carol", "dave", "eve", "frank"];
    let disagreements = 0;

    for (let i = 0; i < 5000; i++) {
      const policy = {
        requiredApprovals: Math.floor(rnd() * 4),
        denyDestructive: rnd() < 0.5,
      };
      const requester = people[Math.floor(rnd() * people.length)]!;
      const n = Math.floor(rnd() * 5);
      const approverIds = Array.from({ length: n }, () => {
        if (rnd() < 0.15) return requester; // inject self-approval cases
        if (rnd() < 0.1) return people[Math.floor(rnd() * 2)]!; // duplicates
        return people[Math.floor(rnd() * people.length)]!;
      });
      const request = {
        requesterId: requester,
        action: ACTIONS[Math.floor(rnd() * ACTIONS.length)]!,
        approverIds,
      };

      const prod = evaluateApprovalPolicy(policy, request);
      const oracle = leanOracleEvaluateApproval(policy, request);
      if (prod.decision !== oracle.decision || prod.reason !== oracle.reason) {
        disagreements += 1;
        if (disagreements === 1) {
          expect(prod).toEqual(oracle);
        }
      }
    }
    expect(disagreements).toBe(0);
  });
});
