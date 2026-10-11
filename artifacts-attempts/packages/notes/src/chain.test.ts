import { describe, expect, it } from "vitest";
import {
  sealEvidenceNote,
  verifyEvidenceChain,
  verifyEvidenceNote,
  type EvidenceNoteInput,
} from "./index.js";

function base(overrides: Partial<EvidenceNoteInput> = {}): EvidenceNoteInput {
  return {
    schema: "artifacts-attempts.evidence/v1",
    taskId: "tsk_7f2a",
    attemptId: "att_1",
    repo: "tsk_7f2a-att_1",
    commit: "a".repeat(40),
    evaluatedAt: "2026-10-11T14:02:11.000Z",
    agent: { client: "claude-code", model: "claude-sonnet" },
    tests: { passed: 142, failed: 0, command: "npm test" },
    policy: { clean: true, violations: [] },
    diff: { insertions: 18, deletions: 6 },
    prev: null,
    ...overrides,
  };
}

describe("evidence hash chain", () => {
  it("seals a stable hash and verifies", () => {
    const a = sealEvidenceNote(base());
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyEvidenceNote(a)).toEqual({ ok: true });
  });

  it("chains three notes; tampering breaks the chain", () => {
    const n1 = sealEvidenceNote(base({ attemptId: "att_1", commit: "1".repeat(40) }));
    const n2 = sealEvidenceNote(
      base({ attemptId: "att_2", commit: "2".repeat(40), prev: n1.hash, tests: { passed: 139, failed: 3, command: "npm test" } })
    );
    const n3 = sealEvidenceNote(
      base({
        attemptId: "att_3",
        commit: "3".repeat(40),
        prev: n2.hash,
        policy: { clean: false, violations: ["egress:evil.example"] },
        tests: { passed: 140, failed: 0, command: "npm test" },
      })
    );

    expect(verifyEvidenceChain([n1, n2, n3])).toEqual({ ok: true });

    const tampered = { ...n2, tests: { ...n2.tests, failed: 0 } };
    expect(verifyEvidenceNote(tampered).ok).toBe(false);
    expect(verifyEvidenceChain([n1, tampered, n3]).ok).toBe(false);
  });

  it("detects broken prev links", () => {
    const n1 = sealEvidenceNote(base());
    const n2 = sealEvidenceNote(base({ attemptId: "att_2", commit: "2".repeat(40), prev: "deadbeef" }));
    expect(verifyEvidenceChain([n1, n2]).ok).toBe(false);
  });
});
