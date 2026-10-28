import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runIsolationConformanceEffect } from "../isolation-backend/conformance.js";
import { IsolationBackendService } from "../isolation-backend/interface.js";
import {
  assertCuaLicenseAllowsWorkEffect,
  callCuaSandbox,
  createMockCuaIsolationLayer,
  createTrialCheckpointLayer,
  cuaLicenseVerdict,
  forkPilotTrialsEffect,
  PINNED_CUA_NPM_VERSION,
  readCuaConfig,
} from "./index.js";
import { assertNoGatewayBypassEffect } from "./gateway-bypass.js";
import { assertReplaySpikeDoneEffect, createCallRecordReplayLayer } from "./record-replay.js";

describe("Cua license gate", () => {
  it("allows self-hosted isolation backend under FSL-1.1-MIT", () => {
    const v = cuaLicenseVerdict("2026-10-28T00:00:00.000Z");
    expect(v.allowedForSelfHostedIsolationBackend).toBe(true);
    expect(v.spacesLicense).toBe("FSL-1.1-MIT");
    expect(v.competingHostedSpacesRequiresCommercial).toBe(true);
  });

  it("honors CLAWQL_CUA_LICENSE_BLOCK override", async () => {
    const prev = process.env.CLAWQL_CUA_LICENSE_BLOCK;
    process.env.CLAWQL_CUA_LICENSE_BLOCK = "1";
    try {
      const r = await Effect.runPromiseExit(assertCuaLicenseAllowsWorkEffect());
      expect(r._tag).toBe("Failure");
    } finally {
      if (prev === undefined) delete process.env.CLAWQL_CUA_LICENSE_BLOCK;
      else process.env.CLAWQL_CUA_LICENSE_BLOCK = prev;
    }
  });
});

describe("Cua config + sandbox_exec façade", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of [
      "CLAWQL_SANDBOX_CUA_ENABLED",
      "CLAWQL_SANDBOX_CUA_MODE",
      "CLAWQL_SANDBOX_CUA_URL",
      "CLAWQL_SANDBOX_CUA_API_TOKEN",
      "CLAWQL_SANDBOX_CUA_DEFAULT_TIER",
    ]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("pins npm version 0.9.0 by default", () => {
    expect(PINNED_CUA_NPM_VERSION).toBe("0.9.0");
    expect(readCuaConfig().pinnedNpmVersion).toBe("0.9.0");
  });

  it("mock mode enables when CLAWQL_SANDBOX_CUA_MODE=mock", () => {
    process.env.CLAWQL_SANDBOX_CUA_MODE = "mock";
    expect(readCuaConfig().enabled).toBe(true);
    expect(readCuaConfig().mode).toBe("mock");
  });

  it("callCuaSandbox tags backend and succeeds in mock", async () => {
    process.env.CLAWQL_SANDBOX_CUA_MODE = "mock";
    const r = await callCuaSandbox({
      code: "print(1)",
      language: "python",
      sessionId: "cua-test-1",
    });
    expect(r.backend).toBe("cua");
    expect(r.success).toBe(true);
    expect(r.stdout).toContain("[cua:");
  });
});

describe("C1 conformance (mock Cua IsolationBackend)", () => {
  const stack = createMockCuaIsolationLayer({
    enabled: true,
    mode: "mock",
    defaultTier: "container",
    pinnedNpmVersion: PINNED_CUA_NPM_VERSION,
    keepPresenceAndApprovalsOnHost: true,
  });

  it.each(["container", "microvm", "full-vm"] as const)(
    "runs end to end for tier %s",
    async (tier) => {
      const report = await Effect.runPromise(
        runIsolationConformanceEffect(tier, {
          sessionId: `c1-${tier}`,
          worktreePath: "/worktree",
        }).pipe(Effect.provide(stack))
      );
      expect(report.backend).toBe("cua");
      expect(report.admitOk).toBe(true);
      expect(report.execOk).toBe(true);
      expect(report.snapshotRestoreOk).toBe(true);
      expect(report.forkOk).toBe(true);
      expect(report.allEscapeBlocked).toBe(true);
      expect(report.escapeProbes.length).toBeGreaterThanOrEqual(4);
    }
  );
});

describe("C2 trial checkpoint forks", () => {
  it("forks N=50 arms from one checkpoint with identical parent", async () => {
    const cua = createMockCuaIsolationLayer({
      enabled: true,
      mode: "mock",
      defaultTier: "microvm",
      pinnedNpmVersion: PINNED_CUA_NPM_VERSION,
      keepPresenceAndApprovalsOnHost: true,
    });
    const stack = createTrialCheckpointLayer().pipe(Layer.provideMerge(cua));
    const { checkpoint, arms } = await Effect.runPromise(
      forkPilotTrialsEffect({
        sessionId: "pilot-source",
        tier: "microvm",
        worktreePath: "/worktree",
        armCount: 50,
        armPrefix: "durability",
      }).pipe(Effect.provide(stack))
    );
    expect(arms).toHaveLength(50);
    expect(checkpoint.publishGradeAllowed).toBe(false);
    expect(checkpoint.host.cuaPinnedVersion).toBe(PINNED_CUA_NPM_VERSION);
    const parents = new Set(arms.map((a) => a.session.parentSnapshotId));
    expect(parents.size).toBe(1);
    expect(parents.has(checkpoint.snapshot.snapshotId)).toBe(true);
    expect(arms[0]?.session.trialId).toBe("durability-000");
    expect(arms[49]?.session.trialId).toBe("durability-049");
  });
});

describe("C3 record-and-replay spike", () => {
  it("resumes without repeated write and catches divergent digest", async () => {
    const result = await Effect.runPromise(
      assertReplaySpikeDoneEffect().pipe(Effect.provide(createCallRecordReplayLayer()))
    );
    expect(result.noRepeatedWrite).toBe(true);
    expect(result.divergentCaught).toBe(true);
  });
});

describe("C4 gateway no-bypass", () => {
  it("blocks direct IP, DNS, IPv6, and hardcoded endpoints", async () => {
    const stack = createMockCuaIsolationLayer({
      enabled: true,
      mode: "mock",
      defaultTier: "container",
      pinnedNpmVersion: PINNED_CUA_NPM_VERSION,
      keepPresenceAndApprovalsOnHost: true,
    });
    const report = await Effect.runPromise(
      Effect.gen(function* () {
        const backend = yield* IsolationBackendService;
        yield* backend.admit({
          sessionId: "c4-sess",
          tier: "container",
          worktreePath: "/worktree",
        });
        return yield* assertNoGatewayBypassEffect("c4-sess");
      }).pipe(Effect.provide(stack))
    );
    expect(report.allBlockedOrProxied).toBe(true);
    expect(report.probes.map((p) => p.kind).sort()).toEqual(
      ["direct-ip", "hardcoded-endpoint", "ipv6", "raw-dns"].sort()
    );
  });
});
