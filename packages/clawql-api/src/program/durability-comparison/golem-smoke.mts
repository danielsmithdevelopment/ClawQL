import { Effect } from "effect";
import { golemArm } from "./peer-live-arms.ts";

try {
  const r = await Effect.runPromise(golemArm.run({ n: 1 }));
  console.log(
    JSON.stringify(
      {
        status: r.status,
        honesty: r.honesty,
        modes: r.modes.map((m) => ({
          mode: m.upstreamMode,
          n: m.n,
          dups: m.duplicates,
          effects: m.uniqueWriteEffects,
          pass: m.boardPass,
          detail: m.trials[0]?.detail,
        })),
      },
      null,
      2
    )
  );
} catch (e) {
  console.error("SMOKE FAIL", e);
  process.exit(1);
}
