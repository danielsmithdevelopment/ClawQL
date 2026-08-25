import type { LoopHistoryEntry, LoopState } from "../../src/types.js";

/** Harness-local stagnation taxonomy aligned with clawql-ouroboros convergence codes. */
export enum StagnationPattern {
  NONE = "none",
  STAGNATION = "stagnation",
  SPINNING = "spinning",
  DIMINISHING_RETURNS = "diminishing_returns",
  OSCILLATION = "oscillation",
}

const hashEntry = (entry: LoopHistoryEntry): string =>
  JSON.stringify({
    phase: entry.phase,
    outputHash: entry.outputHash,
    ontologySnapshot: entry.ontologySnapshot,
    evalScore: entry.evalScore,
  });

/** Detect loop stagnation from harness history (no LLM required). */
export const detectStagnation = (
  history: readonly LoopHistoryEntry[],
  options: {
    readonly stagnationWindow?: number;
    readonly evalWindow?: number;
  } = {}
): StagnationPattern => {
  const stagnationWindow = options.stagnationWindow ?? 3;
  const evalWindow = options.evalWindow ?? 3;
  const evaluateRows = history.filter((h) => h.phase === "evaluate");
  if (evaluateRows.length < 2) return StagnationPattern.NONE;

  const recent = evaluateRows.slice(-stagnationWindow);
  const hashes = recent.map((r) => r.outputHash ?? hashEntry(r));
  if (hashes.length >= 2 && hashes.every((h) => h === hashes[0])) {
    return StagnationPattern.SPINNING;
  }

  const ontologies = recent
    .map((r) => r.ontologySnapshot)
    .filter((o): o is string => typeof o === "string");
  if (
    ontologies.length >= stagnationWindow &&
    ontologies.every((o) => o === ontologies[0])
  ) {
    return StagnationPattern.STAGNATION;
  }

  const scores = evaluateRows
    .map((r) => r.evalScore)
    .filter((s): s is number => typeof s === "number");
  if (scores.length >= evalWindow) {
    const tail = scores.slice(-evalWindow);
    const declining = tail.every((s, i) => i === 0 || s <= tail[i - 1]!);
    const flat = tail.every((s) => s === tail[0]);
    if (declining && !flat) return StagnationPattern.DIMINISHING_RETURNS;
  }

  if (ontologies.length >= 4) {
    const tail = ontologies.slice(-4);
    if (tail[0] === tail[2] && tail[1] === tail[3] && tail[0] !== tail[1]) {
      return StagnationPattern.OSCILLATION;
    }
  }

  return StagnationPattern.NONE;
};

export const stagnationPatternForState = (state: LoopState): StagnationPattern =>
  detectStagnation(state.history);
