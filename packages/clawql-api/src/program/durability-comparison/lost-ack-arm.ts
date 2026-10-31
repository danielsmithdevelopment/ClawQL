/**
 * ClawQL lost-ack expansion pilot (N=50): server processed the write; response never
 * arrived (SIGKILL after host apply). Modes: idempotent keys · lookup_by_reference ·
 * neither (non_idempotent, no key).
 */

import { Effect } from "effect";
import { oneKillMidWriteTrial, summarizeMode } from "./kill-trial-shared.js";
import type { ArmModeResult, ArmResult, DurabilityArm, UpstreamMode } from "./types.js";

const LOST_ACK_MODES: readonly {
  readonly upstreamMode: UpstreamMode;
  readonly resumePolicy: "lost-ack-clawql" | "lost-ack-lookup";
  readonly includeIdempotencyKey: boolean;
  readonly requireZeroDuplicates: boolean;
}[] = [
  {
    upstreamMode: "idempotent",
    resumePolicy: "lost-ack-clawql",
    includeIdempotencyKey: true,
    requireZeroDuplicates: true,
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
            "Lost-ack pilot: host applied the write then SIGKILL before the runner saw a response. idempotent → ClawQL parks outcome_unknown (no blind resend; keyed REST retry not wired into durable-runner yet). lookup_by_reference → check-then-decide resolves without resend when the reference is in the host log. neither (non_idempotent, no key) → stay outcome_unknown, never re-send. N=50 expansion pilot for config-review package.",
          modes,
        };
      },
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    }).pipe(Effect.orDie),
};
