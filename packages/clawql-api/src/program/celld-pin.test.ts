import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  CELLD_PINNED_VERSION,
  celldPinLayer,
  celldPinStatusEffect,
  CelldPinService,
} from "./celld-pin.js";

describe("celld pin readiness", () => {
  it("defaults to file-journal honesty when pin env unset", async () => {
    const status = await Effect.runPromise(celldPinStatusEffect({}));
    expect(status.pinnedVersion).toBe(CELLD_PINNED_VERSION);
    expect(status.reportedVersion).toBeNull();
    expect(status.versionMatches).toBe(false);
    expect(status.isolateFlag).toBe(false);
    expect(status.isolateReady).toBe(false);
    expect(status.honesty).toContain("file-journal");
  });

  it("requires both matching CELLD_VERSION and isolate flag", async () => {
    const versionOnly = await Effect.runPromise(celldPinStatusEffect({ CELLD_VERSION: "0.4.0" }));
    expect(versionOnly.reportedVersion).toBe("v0.4.0");
    expect(versionOnly.versionMatches).toBe(true);
    expect(versionOnly.isolateReady).toBe(false);

    const flagOnly = await Effect.runPromise(
      celldPinStatusEffect({ CLAWQL_PROGRAM_CELLD_ISOLATE: "1" })
    );
    expect(flagOnly.isolateFlag).toBe(true);
    expect(flagOnly.isolateReady).toBe(false);

    const both = await Effect.runPromise(
      celldPinStatusEffect({
        CELLD_VERSION: "v0.4.0",
        CLAWQL_PROGRAM_CELLD_ISOLATE: "1",
      })
    );
    expect(both.isolateReady).toBe(true);
    expect(both.honesty).toContain("kill-node");
  });

  it("CelldPinService layer exposes status", async () => {
    const status = await Effect.runPromise(
      Effect.gen(function* () {
        const pin = yield* CelldPinService;
        return yield* pin.status();
      }).pipe(
        Effect.provide(
          celldPinLayer({
            CELLD_VERSION: CELLD_PINNED_VERSION,
            CLAWQL_PROGRAM_CELLD_ISOLATE: "yes",
          })
        )
      )
    );
    expect(status.isolateReady).toBe(true);
  });
});
