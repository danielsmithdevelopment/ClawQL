/**
 * TypeScript mirror of formal/lean/InformationFlow.lean — differential-test oracle.
 * Keep semantics in lockstep with the Lean model; proofs live in Lean, not here.
 *
 * This mirrors the *empty-config* core of production `mayFlow` (single destination):
 * empty from → allow; public dest → allow; else each label public or equals dest.
 */

import { Effect } from "effect";
import { PUBLIC_LABEL, type Label } from "./labels.js";

/** Lean `mem` / List.contains analogue. */
export function leanOracleMem(x: Label, xs: readonly Label[]): boolean {
  return xs.some((y) => y === x);
}

/** Lean `accumulateLabels`. */
export function leanOracleAccumulateLabels(
  acc: readonly Label[],
  news: readonly Label[]
): Label[] {
  let out = [...acc];
  for (const n of news) {
    if (!leanOracleMem(n, out)) out = [...out, n];
  }
  return out;
}

/**
 * Lean `mayFlow` — single destination, empty allow-list config.
 * Production multi-dest / allow-list config is exercised separately in session-ifc tests.
 */
export function leanOracleMayFlow(fromUnion: readonly Label[], dest: Label): boolean {
  if (fromUnion.length === 0) return true;
  if (dest === PUBLIC_LABEL) return true;
  return fromUnion.every((lbl) => lbl === PUBLIC_LABEL || lbl === dest);
}

export function leanOracleWriteAllowed(fromUnion: readonly Label[], dest: Label): boolean {
  return leanOracleMayFlow(fromUnion, dest);
}

/** Effect wrappers for domain consistency. */
export const leanOracleMayFlowEffect = (
  fromUnion: readonly Label[],
  dest: Label
): Effect.Effect<boolean> => Effect.sync(() => leanOracleMayFlow(fromUnion, dest));

/** Fixtures shared with InformationFlow.lean `fixture_*` theorems. */
export const LEAN_IFC_FIXTURES: ReadonlyArray<{
  readonly name: string;
  readonly fromUnion: readonly Label[];
  readonly dest: Label;
  readonly expected: boolean;
}> = [
  { name: "empty_flows", fromUnion: [], dest: "source:slack", expected: true },
  { name: "public_dest", fromUnion: ["source:github"], dest: PUBLIC_LABEL, expected: true },
  {
    name: "same_source",
    fromUnion: ["source:github"],
    dest: "source:github",
    expected: true,
  },
  {
    name: "cross_source_blocked",
    fromUnion: ["source:github"],
    dest: "source:slack",
    expected: false,
  },
  {
    name: "public_label_ok",
    fromUnion: [PUBLIC_LABEL],
    dest: "source:slack",
    expected: true,
  },
];
