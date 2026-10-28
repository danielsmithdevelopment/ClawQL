import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { runIsolationConformanceEffect } from "./conformance.js";
import { IsolationBackendService } from "./interface.js";
import {
  auditIsolationBackendLicenses,
  ISOLATION_BACKEND_PINS,
  ISOLATION_OSI_LICENSE_ALLOWLIST,
} from "./license-registry.js";
import {
  createMockAppleContainerLayer,
  createMockFirecrackerLayer,
  createMockGvisorLayer,
  createMockLimaLayer,
} from "./mock-backend.js";
import { assertReplaySpikeDoneEffect, createCallRecordReplayLayer } from "./record-replay.js";
import { createTrialCheckpointLayer, forkPilotTrialsEffect } from "./trial-checkpoint.js";
import { assertNoGatewayBypassEffect } from "./gateway-bypass.js";

describe("isolation backend license allowlist", () => {
  it("every pin is OSI-approved Apache-2.0 (or allowlisted)", () => {
    const audit = auditIsolationBackendLicenses("2026-10-28T00:00:00.000Z");
    expect(audit.ok).toBe(true);
    expect(audit.violations).toEqual([]);
    expect(ISOLATION_OSI_LICENSE_ALLOWLIST).toContain("Apache-2.0");
    for (const pin of ISOLATION_BACKEND_PINS) {
      expect(ISOLATION_OSI_LICENSE_ALLOWLIST).toContain(pin.licenseSpdx);
    }
  });

  it("rejects Tart and does not list Cua", () => {
    const ids = ISOLATION_BACKEND_PINS.map((p) => p.id);
    expect(ids).not.toContain("cua");
    const lima = ISOLATION_BACKEND_PINS.find((p) => p.id === "lima");
    expect(lima?.rejectedAlternatives?.some((x) => /Tart/i.test(x))).toBe(true);
  });

  it("Firecracker is snapshot-spike priority 1", () => {
    const fc = ISOLATION_BACKEND_PINS.find((p) => p.id === "firecracker");
    expect(fc?.snapshotSpikePriority).toBe(1);
    expect(fc?.publishGradeOnDedicatedLinux).toBe(true);
  });
});

describe("C1 conformance — open backends", () => {
  it("Firecracker microVM end to end (snapshot spike primary)", async () => {
    const report = await Effect.runPromise(
      runIsolationConformanceEffect("microvm", {
        sessionId: "c1-fc",
        worktreePath: "/worktree",
      }).pipe(Effect.provide(createMockFirecrackerLayer()))
    );
    expect(report.backend).toBe("firecracker");
    expect(report.admitOk).toBe(true);
    expect(report.execOk).toBe(true);
    expect(report.snapshotRestoreOk).toBe(true);
    expect(report.forkOk).toBe(true);
    expect(report.allEscapeBlocked).toBe(true);
  });

  it("gVisor middle tier admits and escapes; no snapshot claim", async () => {
    const report = await Effect.runPromise(
      runIsolationConformanceEffect("gvisor", {
        sessionId: "c1-gvisor",
        worktreePath: "/worktree",
      }).pipe(Effect.provide(createMockGvisorLayer()))
    );
    expect(report.backend).toBe("gvisor");
    expect(report.admitOk).toBe(true);
    expect(report.execOk).toBe(true);
    expect(report.snapshotRestoreOk).toBe(false);
    expect(report.forkOk).toBe(false);
    expect(report.allEscapeBlocked).toBe(true);
  });

  it("Apple container tier end to end", async () => {
    const report = await Effect.runPromise(
      runIsolationConformanceEffect("container", {
        sessionId: "c1-apple",
        worktreePath: "/worktree",
      }).pipe(Effect.provide(createMockAppleContainerLayer()))
    );
    expect(report.backend).toBe("apple-container");
    expect(report.snapshotRestoreOk).toBe(true);
    expect(report.allEscapeBlocked).toBe(true);
  });

  it("Lima full-vm tier end to end", async () => {
    const report = await Effect.runPromise(
      runIsolationConformanceEffect("full-vm", {
        sessionId: "c1-lima",
        worktreePath: "/worktree",
      }).pipe(Effect.provide(createMockLimaLayer()))
    );
    expect(report.backend).toBe("lima");
    expect(report.snapshotRestoreOk).toBe(true);
    expect(report.allEscapeBlocked).toBe(true);
  });
});

describe("C2 trial checkpoint forks (Firecracker-first)", () => {
  it("forks N=50 arms from one Firecracker checkpoint", async () => {
    const stack = createTrialCheckpointLayer().pipe(
      Layer.provideMerge(createMockFirecrackerLayer())
    );
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
    expect(checkpoint.host.backendId).toBe("firecracker");
    expect(checkpoint.publishGradeAllowed).toBe(true);
    const parents = new Set(arms.map((a) => a.session.parentSnapshotId));
    expect(parents.size).toBe(1);
    expect(parents.has(checkpoint.snapshot.snapshotId)).toBe(true);
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
  it("blocks direct IP, DNS, IPv6, and hardcoded endpoints on Firecracker", async () => {
    const report = await Effect.runPromise(
      Effect.gen(function* () {
        const backend = yield* IsolationBackendService;
        yield* backend.admit({
          sessionId: "c4-sess",
          tier: "microvm",
          worktreePath: "/worktree",
        });
        return yield* assertNoGatewayBypassEffect("c4-sess");
      }).pipe(Effect.provide(createMockFirecrackerLayer()))
    );
    expect(report.allBlockedOrProxied).toBe(true);
    expect(report.probes.map((p) => p.kind).sort()).toEqual(
      ["direct-ip", "hardcoded-endpoint", "ipv6", "raw-dns"].sort()
    );
  });
});
