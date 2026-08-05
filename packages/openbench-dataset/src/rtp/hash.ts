import { createHash } from "node:crypto";
import type { RtpTurnNode } from "./types.js";

/** Canonical JSON for hashing (stable key order). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeys(obj[key]);
    }
    return out;
  }
  return value;
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

/**
 * RTP Appendix A–style turn hash: H(prevTurnHash || "genesis" || canonical(nodeWithoutHashes)).
 */
export function computeTurnHash(
  nodeWithoutHashes: Omit<RtpTurnNode, "turnHash" | "prevTurnHash"> & {
    prevTurnHash?: string | null;
  },
  prevTurnHash: string | null
): string {
  const body = {
    kind: nodeWithoutHashes.kind,
    turnIndex: nodeWithoutHashes.turnIndex,
    intent: nodeWithoutHashes.intent,
    retrieval: nodeWithoutHashes.retrieval,
    reasoning: nodeWithoutHashes.reasoning,
    execution: nodeWithoutHashes.execution,
    delta: nodeWithoutHashes.delta,
    verdict: nodeWithoutHashes.verdict,
  };
  return sha256Canonical({
    prev: prevTurnHash ?? "genesis",
    node: body,
  });
}

export function sealTurn(
  partial: Omit<RtpTurnNode, "turnHash" | "prevTurnHash">,
  prevTurnHash: string | null
): RtpTurnNode {
  const turnHash = computeTurnHash(partial, prevTurnHash);
  return {
    ...partial,
    prevTurnHash,
    turnHash,
  };
}
