/**
 * Vault note trust provenance for recall ranking and agent-facing snippets.
 *
 * Labeled-untrusted notes remain searchable but rank below trusted facts, and
 * their provenance is surfaced so models can tell them apart (integrity cell).
 */

import { Effect } from "effect";

export const CLAWQL_UNTRUSTED_TAG = "clawql-untrusted";
export const CLAWQL_TRUST_BODY_MARKER = "**clawql_trust:** untrusted";

const UNTRUSTED_MARKERS = [
  CLAWQL_UNTRUSTED_TAG,
  CLAWQL_TRUST_BODY_MARKER,
  "clawql_trust: untrusted",
] as const;

export function noteIsUntrustedLabeled(text: string): boolean {
  if (!text) return false;
  return UNTRUSTED_MARKERS.some((m) => text.includes(m));
}

export type NoteTrustClass = "trusted" | "untrusted";

export function noteTrustClass(text: string): NoteTrustClass {
  return noteIsUntrustedLabeled(text) ? "untrusted" : "trusted";
}

/**
 * Adjust a lexical/vector score so trusted notes outrank labeled poison.
 * Large enough to beat typical keyword ties; untrusted still searchable.
 */
export function applyTrustRankAdjust(score: number, text: string): number {
  if (noteIsUntrustedLabeled(text)) {
    return Math.max(0, score * 0.15 - 5);
  }
  return score + 2;
}

/** Prefix snippet with provenance so the model sees the label. */
export function annotateSnippetWithTrust(snippet: string, text: string): string {
  if (!noteIsUntrustedLabeled(text)) return snippet;
  const prefix = "[clawql_trust: untrusted] ";
  if (snippet.startsWith(prefix) || snippet.includes("clawql_trust")) return snippet;
  return `${prefix}${snippet}`;
}

export function applyTrustRankAdjustEffect(
  score: number,
  text: string
): Effect.Effect<number> {
  return Effect.sync(() => applyTrustRankAdjust(score, text));
}
