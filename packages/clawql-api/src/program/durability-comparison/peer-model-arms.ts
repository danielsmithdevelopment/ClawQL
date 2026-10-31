/**
 * Model-faithful peer sims (like naive-retry) — measured on the tip harnessCommit.
 * Real `golem` / `pi-durable` rows stay pending_adapter until adapters run.
 * These ArmIds are simulators; do not publish as named Pi/Golem boards.
 */

import { Effect } from "effect";
import { oneKillMidWriteTrial, summarizeMode } from "./kill-trial-shared.js";
import type { ArmModeResult, ArmResult, ArmId, DurabilityArm } from "./types.js";

function makePeerModelArm(opts: {
  readonly id: Extract<ArmId, "golem-at-least-once-sim" | "pi-interrupt-sim">;
  readonly resumePolicy: "golem-at-least-once-sim" | "pi-interrupt-sim";
  readonly runtime: string;
  readonly honesty: string;
}): DurabilityArm {
  return {
    id: opts.id,
    run: ({ n, harnessCommit }) =>
      Effect.tryPromise({
        try: async (): Promise<ArmResult> => {
          const modes: ArmModeResult[] = [];
          for (const upstreamMode of ["idempotent", "non_idempotent"] as const) {
            const trials = [];
            for (let i = 0; i < n; i++) {
              trials.push(
                await oneKillMidWriteTrial({
                  i,
                  upstreamMode,
                  resumePolicy: opts.resumePolicy,
                })
              );
            }
            // Sims expect retries — do not require zero duplicates.
            modes.push(summarizeMode(upstreamMode, trials, false));
          }
          return {
            armId: opts.id,
            status: "measured",
            runtime: opts.runtime,
            runtimeVersion: "model-sim",
            harnessCommit,
            crashPhase: "during_call",
            honesty: `${opts.honesty} Same tip harnessCommit=${harnessCommit}. Real peer adapter rows (${opts.id === "golem-at-least-once-sim" ? "golem" : "pi-durable"}) remain pending_adapter.`,
            modes,
          };
        },
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      }).pipe(Effect.orDie),
  };
}

/** Golem model: at-least-once retry; idempotent callee → one unique effect. */
export const golemAtLeastOnceSimArm = makePeerModelArm({
  id: "golem-at-least-once-sim",
  resumePolicy: "golem-at-least-once-sim",
  runtime: "golem-model-sim",
  honesty:
    "Model-faithful Golem simulator (not a real Golem runtime): after kill-mid-write, recovery re-sends the write (at least once). Idempotent upstream collapses to one unique effect; non_idempotent multiplies. Placeholder until the real golem adapter lands.",
});

/**
 * Pi interrupt model: durable harness re-enters the interrupted tool call.
 * Effect columns match at-least-once tool re-entry without claiming Golem's auto-key product.
 */
export const piInterruptSimArm = makePeerModelArm({
  id: "pi-interrupt-sim",
  resumePolicy: "pi-interrupt-sim",
  runtime: "pi-interrupt-model-sim",
  honesty:
    "Model-faithful Pi Durable interrupt simulator (not a real Pi runtime): resume re-enters the interrupted tool call, so effect outcomes are at-least-once under kill-mid-write. Does not invent Golem-style automatic idempotency-key injection. Placeholder until the real pi-durable adapter / real-model arm lands.",
});
