import { Effect } from "effect";
import { piDurableAlwaysRetryArm, piDurableNeverRetryArm } from "./peer-live-arms.ts";

for (const [label, arm] of [
  ["never-retry", piDurableNeverRetryArm],
  ["always-retry", piDurableAlwaysRetryArm],
] as const) {
  try {
    const r = await Effect.runPromise(arm.run({ n: 1 }));
    console.log(
      JSON.stringify(
        {
          label,
          status: r.status,
          agentPolicy: r.agentPolicy,
          honesty: r.honesty,
          modes: r.modes.map((m) => ({
            mode: m.upstreamMode,
            n: m.n,
            dups: m.duplicates,
            unk: m.interruptedOrUnknown,
            once: m.completedExactlyOnce,
            effects: m.uniqueWriteEffects,
            harnessValid: m.harnessValid,
            detail: m.trials[0]?.detail,
          })),
        },
        null,
        2
      )
    );
  } catch (e) {
    console.error(`SMOKE FAIL ${label}`, e);
    process.exit(1);
  }
}
