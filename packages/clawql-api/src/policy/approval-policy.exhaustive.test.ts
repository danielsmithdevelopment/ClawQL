import { describe, expect, it } from "vitest";
import {
  evaluateApprovalPolicy,
  type ApprovalActionClass,
  type ApprovalPolicy,
  type ApprovalRequest,
} from "./approval-policy.js";
import { leanOracleEvaluateApproval } from "./approval-policy-oracle.js";

const PEOPLE = ["alice", "bob", "carol"] as const;
const ACTIONS: ApprovalActionClass[] = ["read", "write", "delete", "payment"];

function* approverCombos(): Generator<string[]> {
  yield [];
  for (const a of PEOPLE) yield [a];
  for (const a of PEOPLE) for (const b of PEOPLE) yield [a, b];
  for (const a of PEOPLE) for (const b of PEOPLE) for (const c of PEOPLE) yield [a, b, c];
}

describe("approval policy exhaustive small domain", () => {
  it("agrees with Lean oracle on every combo (≤3 people, policies, actions)", () => {
    let cases = 0;
    for (const requiredApprovals of [0, 1, 2, 3, 4]) {
      for (const denyDestructive of [false, true]) {
        const policy: ApprovalPolicy = { requiredApprovals, denyDestructive };
        for (const requesterId of PEOPLE) {
          for (const action of ACTIONS) {
            for (const approverIds of approverCombos()) {
              const request: ApprovalRequest = { requesterId, action, approverIds };
              const prod = evaluateApprovalPolicy(policy, request);
              const oracle = leanOracleEvaluateApproval(policy, request);
              expect(prod, JSON.stringify({ policy, request })).toEqual(oracle);
              cases += 1;
            }
          }
        }
      }
    }
    // 5 * 2 * 3 * 4 * (1 + 3 + 9 + 27) = 5*2*3*4*40 = 4800
    expect(cases).toBe(4800);
  });
});
