/**
 * ClawQL file-journal kill-mid-write arm + optional naive-retry reference arm.
 * Counts duplicates and outcome_unknown under both upstream modes.
 */

import { Effect } from "effect";
import { oneKillMidWriteTrial, summarizeMode } from "./kill-trial-shared.js";
import type { ArmModeResult, ArmResult, DurabilityArm } from "./types.js";

function makeFileJournalArm(resumePolicy: "clawql" | "naive-retry"): DurabilityArm {
  const id = resumePolicy === "clawql" ? "clawql-file-journal" : "naive-retry";
  return {
    id,
    run: ({ n, harnessCommit }) =>
      Effect.tryPromise({
        try: async (): Promise<ArmResult> => {
          const modes: ArmModeResult[] = [];
          for (const upstreamMode of ["idempotent", "non_idempotent"] as const) {
            const trials = [];
            for (let i = 0; i < n; i++) {
              trials.push(await oneKillMidWriteTrial({ i, upstreamMode, resumePolicy }));
            }
            modes.push(summarizeMode(upstreamMode, trials, resumePolicy === "clawql"));
          }
          if (resumePolicy === "clawql") {
            return {
              armId: id,
              status: "measured",
              runtime: "clawql-file-journal",
              runtimeVersion: "host-file-journal",
              harnessCommit,
              crashPhase: "during_call",
              honesty:
                "ClawQL file-journal: no write re-send after SIGKILL; resume uses outcome_unknown. Duplicates must be 0 in both upstream modes. Columns: intentPresentOnResume + callVerifiedSent. Package default N=50 to match peer pilots.",
              modes,
            };
          }
          return {
            armId: id,
            status: "measured",
            runtime: "naive-retry-reference",
            runtimeVersion: "host-file-journal",
            harnessCommit,
            crashPhase: "during_call",
            honesty:
              "Reference arm: forces write re-send after kill. Idempotent upstream can mask duplicates; non_idempotent multiplies effects. Not ClawQL product behavior.",
            modes,
          };
        },
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      }).pipe(Effect.orDie),
  };
}

export const clawqlFileJournalArm = makeFileJournalArm("clawql");
export const naiveRetryArm = makeFileJournalArm("naive-retry");
