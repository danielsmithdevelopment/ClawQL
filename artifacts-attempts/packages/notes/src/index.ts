/**
 * Evidence notes attached as Git notes (or R2 fallback).
 * hash = SHA-256(RFC 8785 canonical JSON of note without `hash`, with `prev`).
 */

import { createHash } from "node:crypto";
import canonicalize from "canonicalize";

export type EvidenceTests = {
  passed: number;
  failed: number;
  command: string;
};

export type EvidencePolicy = {
  clean: boolean;
  violations: string[];
};

export type EvidenceNote = {
  schema: "artifacts-attempts.evidence/v1";
  taskId: string;
  attemptId: string;
  repo: string;
  commit: string;
  evaluatedAt: string;
  agent: { client: string; model: string };
  tests: EvidenceTests;
  policy: EvidencePolicy;
  diff: { insertions: number; deletions: number };
  /** Previous note hash in this task, or null for the first note. */
  prev: string | null;
  /** SHA-256 hex of canonical JSON excluding this field. */
  hash: string;
};

export type EvidenceNoteInput = Omit<EvidenceNote, "hash">;

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/** Serialize without `hash`, RFC 8785 canonical JSON, then SHA-256. */
export function computeEvidenceHash(note: EvidenceNoteInput | EvidenceNote): string {
  const { hash: _drop, ...rest } = note as EvidenceNote & { hash?: string };
  const canonical = canonicalize(rest);
  if (canonical === undefined) {
    throw new Error("canonicalize returned undefined");
  }
  return sha256Hex(canonical);
}

export function sealEvidenceNote(input: EvidenceNoteInput): EvidenceNote {
  const hash = computeEvidenceHash(input);
  return { ...input, hash };
}

export function verifyEvidenceNote(note: EvidenceNote): { ok: true } | { ok: false; reason: string } {
  const expected = computeEvidenceHash(note);
  if (note.hash !== expected) {
    return { ok: false, reason: `hash mismatch: got ${note.hash}, expected ${expected}` };
  }
  return { ok: true };
}

/**
 * Verify a task-scoped hash chain (order = evaluation order).
 * Editing any note or breaking prev links fails the chain.
 */
export function verifyEvidenceChain(
  notes: readonly EvidenceNote[]
): { ok: true } | { ok: false; reason: string; index?: number } {
  let prev: string | null = null;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]!;
    const single = verifyEvidenceNote(n);
    if (!single.ok) {
      return { ok: false, reason: single.reason, index: i };
    }
    if (n.prev !== prev) {
      return {
        ok: false,
        reason: `prev mismatch at ${i}: got ${String(n.prev)}, expected ${String(prev)}`,
        index: i,
      };
    }
    prev = n.hash;
  }
  return { ok: true };
}

export function parseEvidenceNote(raw: string): EvidenceNote {
  const parsed = JSON.parse(raw) as EvidenceNote;
  if (parsed.schema !== "artifacts-attempts.evidence/v1") {
    throw new Error(`unsupported evidence schema: ${String(parsed.schema)}`);
  }
  return parsed;
}
