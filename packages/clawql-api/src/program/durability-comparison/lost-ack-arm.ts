/**
 * ClawQL lost-ack expansion pilot (N=50): server processed the write; response never
 * arrived (SIGKILL after host apply). Modes: idempotent keys · lookup_by_reference ·
 * neither (non_idempotent, no key).
 *
 * Keys must resolve (safe resend → one unique effect) — not park unknown. That matches
 * the REST clawql-mandate keyed-redrive product path; durable-runner still parks
 * unknown until keyed resume is wired there.
 */

import { Effect } from "effect";
import { oneKillMidWriteTrial, summarizeMode } from "./kill-trial-shared.js";
import type { ArmModeResult, ArmResult, DurabilityArm, UpstreamMode } from "./types.js";

const LOST_ACK_MODES: readonly {
  readonly upstreamMode: UpstreamMode;
  readonly resumePolicy: "lost-ack-clawql" | "lost-ack-keyed-retry" | "lost-ack-lookup";
  readonly includeIdempotencyKey: boolean;
  readonly requireZeroDuplicates: boolean;
}[] = [
  {
    upstreamMode: "idempotent",
    resumePolicy: "lost-ack-keyed-retry",
    includeIdempotencyKey: true,
    // Keyed resend may count as a parent execute; unique effects must stay 1.
    requireZeroDuplicates: false,
  },
  {
    upstreamMode: "lookup_by_reference",
    resumePolicy: "lost-ack-lookup",
    includeIdempotencyKey: true,
    requireZeroDuplicates: true,
  },
  {
    upstreamMode: "non_idempotent",
    resumePolicy: "lost-ack-clawql",
    includeIdempotencyKey: false,
    requireZeroDuplicates: true,
  },
];

export const clawqlLostAckArm: DurabilityArm = {
  id: "clawql-file-journal",
  run: ({ n, harnessCommit }) =>
    Effect.tryPromise({
      try: async (): Promise<ArmResult> => {
        const modes: ArmModeResult[] = [];
        for (const mode of LOST_ACK_MODES) {
          const trials = [];
          for (let i = 0; i < n; i++) {
            trials.push(
              await oneKillMidWriteTrial({
                i,
                upstreamMode: mode.upstreamMode,
                resumePolicy: mode.resumePolicy,
                includeIdempotencyKey: mode.includeIdempotencyKey,
              })
            );
          }
          modes.push(summarizeMode(mode.upstreamMode, trials, mode.requireZeroDuplicates));
        }
        return {
          armId: "clawql-file-journal",
          status: "measured",
          runtime: "clawql-file-journal",
          runtimeVersion: "host-file-journal",
          harnessCommit,
          crashPhase: "lost_ack",
          honesty:
            "Lost-ack pilot: host applied the write then SIGKILL before the runner saw a response. idempotent → keyed resend with the same key (one unique effect; mirrors REST clawql-mandate redrive — durable-runner still parks unknown until keyed resume lands there). lookup_by_reference → check-then-decide resolves without resend. neither (non_idempotent, no key) → stay outcome_unknown, never re-send. N=50 expansion pilot; not a named peer row.",
          modes,
        };
      },
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    }).pipe(Effect.orDie),
};
