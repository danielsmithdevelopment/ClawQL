/**
 * Process-level WORM host boot (audit 3.01 / 3.05).
 */
import { afterEach, describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  disposeProcessWormHostEffect,
  ensureProcessWormHostBootedEffect,
} from "./process-worm-host.js";
import { applyRegulatedProfileEnvEffect } from "./regulated-profile.js";

describe("ensureProcessWormHostBootedEffect", () => {
  const saved: Record<string, string | undefined> = {};

  function remember(keys: string[]) {
    for (const k of keys) saved[k] = process.env[k];
  }

  function restore() {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  afterEach(async () => {
    await Effect.runPromise(disposeProcessWormHostEffect());
    restore();
  });

  it("refuses CLAWQL_TIER=regulated with CLAWQL_WORM_ENABLED=0", async () => {
    remember(["CLAWQL_TIER", "CLAWQL_WORM_ENABLED", "CLAWQL_ALLOW_NO_ENFORCEMENT"]);
    process.env.CLAWQL_TIER = "regulated";
    process.env.CLAWQL_WORM_ENABLED = "0";
    delete process.env.CLAWQL_ALLOW_NO_ENFORCEMENT;

    await expect(Effect.runPromise(ensureProcessWormHostBootedEffect(process.env))).rejects.toThrow(
      /regulated.*WORM disabled/i
    );
  });

  it("regulated profile refuses ALLOW_NO_ENFORCEMENT", async () => {
    remember(["CLAWQL_TIER", "CLAWQL_ALLOW_NO_ENFORCEMENT", "CLAWQL_SANDBOX_BACKEND"]);
    process.env.CLAWQL_TIER = "regulated";
    process.env.CLAWQL_ALLOW_NO_ENFORCEMENT = "1";
    delete process.env.CLAWQL_SANDBOX_BACKEND;

    await expect(Effect.runPromise(applyRegulatedProfileEnvEffect(process.env))).rejects.toThrow(
      /ALLOW_NO_ENFORCEMENT/
    );
  });

  it("regulated profile sets Panguard + IFC defaults", async () => {
    remember([
      "CLAWQL_TIER",
      "CLAWQL_ALLOW_NO_ENFORCEMENT",
      "CLAWQL_PANGUARD_PROXY_PLUGIN",
      "CLAWQL_PANGUARD_IN_PROCESS",
      "CLAWQL_ENABLE_SESSION_IFC",
      "CLAWQL_OPERATION_RISK_ENFORCE",
      "CLAWQL_WORM_REQUIRED",
      "CLAWQL_SANDBOX_BACKEND",
    ]);
    process.env.CLAWQL_TIER = "regulated";
    delete process.env.CLAWQL_ALLOW_NO_ENFORCEMENT;
    delete process.env.CLAWQL_PANGUARD_PROXY_PLUGIN;
    delete process.env.CLAWQL_PANGUARD_IN_PROCESS;
    delete process.env.CLAWQL_ENABLE_SESSION_IFC;
    delete process.env.CLAWQL_OPERATION_RISK_ENFORCE;
    delete process.env.CLAWQL_WORM_REQUIRED;
    delete process.env.CLAWQL_SANDBOX_BACKEND;

    const snap = await Effect.runPromise(applyRegulatedProfileEnvEffect(process.env));
    expect(snap.panguardInProcess).toBe(true);
    expect(snap.sessionIfc).toBe(true);
    expect(snap.operationRiskEnforce).toBe(true);
    expect(process.env.CLAWQL_WORM_REQUIRED).toBe("1");
    expect(process.env.CLAWQL_SANDBOX_BACKEND).toBe("auto");
  });
});
