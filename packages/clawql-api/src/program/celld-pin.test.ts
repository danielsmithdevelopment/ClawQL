import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  CELLD_PINNED_VERSION,
  celldPinLayer,
  celldPinStatusEffect,
  CelldPinService,
  type CelldBinaryProbe,
} from "./celld-pin.js";

function probeOf(result: {
  present: boolean;
  version: string | null;
  path?: string | null;
}): CelldBinaryProbe {
  return () =>
    Effect.succeed({
      present: result.present,
      version: result.version,
      path: result.path ?? (result.present ? "celld" : null),
    });
}

describe("celld pin readiness", () => {
  it("defaults to file-journal honesty when pin env unset", async () => {
    const status = await Effect.runPromise(
      celldPinStatusEffect({}, probeOf({ present: false, version: null }))
    );
    expect(status.pinnedVersion).toBe(CELLD_PINNED_VERSION);
    expect(status.reportedVersion).toBeNull();
    expect(status.versionMatches).toBe(false);
    expect(status.isolateFlag).toBe(false);
    expect(status.binaryPresent).toBe(false);
    expect(status.isolateReady).toBe(false);
    expect(status.honesty).toContain("file-journal");
    expect(status.honesty).toContain("binary=missing");
  });

  it("requires env pin, isolate flag, and matching binary", async () => {
    const env = {
      CELLD_VERSION: "v0.4.0",
      CLAWQL_PROGRAM_CELLD_ISOLATE: "1",
    };

    const envOnly = await Effect.runPromise(
      celldPinStatusEffect(env, probeOf({ present: false, version: null }))
    );
    expect(envOnly.versionMatches).toBe(true);
    expect(envOnly.isolateFlag).toBe(true);
    expect(envOnly.isolateReady).toBe(false);
    expect(envOnly.honesty).toContain("binary=missing");

    const wrongBinary = await Effect.runPromise(
      celldPinStatusEffect(env, probeOf({ present: true, version: "v0.3.0" }))
    );
    expect(wrongBinary.binaryPresent).toBe(true);
    expect(wrongBinary.binaryMatches).toBe(false);
    expect(wrongBinary.isolateReady).toBe(false);

    const ready = await Effect.runPromise(
      celldPinStatusEffect(env, probeOf({ present: true, version: "v0.4.0" }))
    );
    expect(ready.isolateReady).toBe(true);
    expect(ready.honesty).toContain("kill-node");
    expect(ready.honesty).toContain("binary on PATH");
  });

  it("CLAWQL_CELLD_PROBE_VERSION fixture skips spawn", async () => {
    const status = await Effect.runPromise(
      celldPinStatusEffect({
        CELLD_VERSION: CELLD_PINNED_VERSION,
        CLAWQL_PROGRAM_CELLD_ISOLATE: "1",
        CLAWQL_CELLD_PROBE_VERSION: "0.4.0",
      })
    );
    expect(status.binaryPresent).toBe(true);
    expect(status.binaryVersion).toBe("v0.4.0");
    expect(status.isolateReady).toBe(true);
  });

  it("CelldPinService layer exposes status", async () => {
    const status = await Effect.runPromise(
      Effect.gen(function* () {
        const pin = yield* CelldPinService;
        return yield* pin.status();
      }).pipe(
        Effect.provide(
          celldPinLayer(
            {
              CELLD_VERSION: CELLD_PINNED_VERSION,
              CLAWQL_PROGRAM_CELLD_ISOLATE: "yes",
            },
            probeOf({ present: true, version: CELLD_PINNED_VERSION })
          )
        )
      )
    );
    expect(status.isolateReady).toBe(true);
  });
});
