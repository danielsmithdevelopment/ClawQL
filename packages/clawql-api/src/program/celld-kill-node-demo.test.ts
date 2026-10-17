import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { CELLD_PINNED_VERSION } from "./celld-pin.js";
import {
  celldKillNodeDemoLayer,
  celldKillNodeDemoReportEffect,
  CelldKillNodeDemoService,
} from "./celld-kill-node-demo.js";

describe("celld kill-node demo report", () => {
  it("stand-in path when pin unset — not isolate-eligible", async () => {
    const report = await Effect.runPromise(
      celldKillNodeDemoReportEffect({}, () =>
        Effect.succeed({ present: false, version: null, path: null })
      )
    );
    expect(report.standInDemoAvailable).toBe(true);
    expect(report.isolateKillNodeEligible).toBe(false);
    expect(report.honesty).toContain("File-journal stand-in");
    expect(report.nextSteps.some((s) => s.includes("CELLD_VERSION"))).toBe(true);
    expect(report.nextSteps.some((s) => s.includes("do not claim celld crash"))).toBe(true);
  });

  it("isolate-eligible only when pin+binary+flag agree", async () => {
    const report = await Effect.runPromise(
      celldKillNodeDemoReportEffect(
        {
          CELLD_VERSION: CELLD_PINNED_VERSION,
          CLAWQL_PROGRAM_CELLD_ISOLATE: "1",
        },
        () =>
          Effect.succeed({
            present: true,
            version: CELLD_PINNED_VERSION,
            path: "celld",
          })
      )
    );
    expect(report.isolateKillNodeEligible).toBe(true);
    expect(report.pin.isolateReady).toBe(true);
    expect(report.nextSteps.some((s) => s.includes("three-arm load-test"))).toBe(true);
  });

  it("CelldKillNodeDemoService layer exposes report", async () => {
    const report = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* CelldKillNodeDemoService;
        return yield* svc.report();
      }).pipe(
        Effect.provide(
          celldKillNodeDemoLayer(
            { CELLD_VERSION: "v0.3.0" },
            () => Effect.succeed({ present: false, version: null, path: null })
          )
        )
      )
    );
    expect(report.isolateKillNodeEligible).toBe(false);
    expect(report.pinnedVersion).toBe(CELLD_PINNED_VERSION);
  });
});
