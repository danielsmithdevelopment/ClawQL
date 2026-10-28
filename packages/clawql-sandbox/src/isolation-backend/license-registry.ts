/**
 * Pinned isolation-backend dependencies + OSI license allowlist (ADR 0018).
 * Confirm each license at the pinned version; CI fails on drift / non-OSI.
 *
 * Avoid: Tart (source-available with commercial restrictions) — not listed.
 */

import { Effect } from "effect";
import type { IsolationBackendId } from "./types.js";

/** OSI-approved SPDX ids we accept for isolation backends. */
export const ISOLATION_OSI_LICENSE_ALLOWLIST = [
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "MIT",
  "ISC",
  "MPL-2.0",
] as const;

export type OsiLicenseId = (typeof ISOLATION_OSI_LICENSE_ALLOWLIST)[number];

export type IsolationBackendPin = {
  readonly id: IsolationBackendId;
  readonly displayName: string;
  readonly repository: string;
  readonly pinnedVersion: string;
  readonly licenseSpdx: OsiLicenseId;
  /** Extra SPDX notes (e.g. Firecracker ships some BSD-3 Crosvm-derived code). */
  readonly licenseNotes: string;
  readonly hostPlatforms: readonly ("darwin" | "linux")[];
  readonly preferredTiers: readonly string[];
  /** Snapshot spike priority: firecracker first, then Apple VZ save/restore. */
  readonly snapshotSpikePriority: number | null;
  readonly publishGradeOnDedicatedLinux: boolean;
  /** Explicitly rejected alternatives (do not add). */
  readonly rejectedAlternatives?: readonly string[];
};

/**
 * Pins recorded 2026-10-28. Bump only after re-checking LICENSE at that tag.
 * Versions are upstream release tags / documented GA lines — not npm packages
 * (these tools are CLI/daemon binaries, not hard JS deps).
 */
export const ISOLATION_BACKEND_PINS: readonly IsolationBackendPin[] = [
  {
    id: "firecracker",
    displayName: "Firecracker",
    repository: "https://github.com/firecracker-microvm/firecracker",
    pinnedVersion: "v1.17.0",
    licenseSpdx: "Apache-2.0",
    licenseNotes: "Apache-2.0; some Crosvm-derived code BSD-3-Clause (also OSI). Confirmed at tag 2026-10-28.",
    hostPlatforms: ["linux"],
    preferredTiers: ["microvm"],
    snapshotSpikePriority: 1,
    publishGradeOnDedicatedLinux: true,
  },
  {
    id: "gvisor",
    displayName: "gVisor",
    repository: "https://github.com/google/gvisor",
    pinnedVersion: "release-20261026.0",
    licenseSpdx: "Apache-2.0",
    licenseNotes: "Apache-2.0 sandboxed kernel (runsc). Confirmed at tag 2026-10-28.",
    hostPlatforms: ["linux"],
    preferredTiers: ["gvisor"],
    snapshotSpikePriority: null,
    publishGradeOnDedicatedLinux: true,
  },
  {
    id: "apple-container",
    displayName: "Apple container / Containerization",
    repository: "https://github.com/apple/containerization",
    pinnedVersion: "0.1.0",
    licenseSpdx: "Apache-2.0",
    licenseNotes:
      "Apache-2.0 (apple/containerization + apple/container). Requires recent macOS on Apple Silicon. Confirmed 2026-10-28.",
    hostPlatforms: ["darwin"],
    preferredTiers: ["container"],
    snapshotSpikePriority: 2,
    publishGradeOnDedicatedLinux: false,
  },
  {
    id: "lima",
    displayName: "Lima",
    repository: "https://github.com/lima-vm/lima",
    pinnedVersion: "v2.2.1",
    licenseSpdx: "Apache-2.0",
    licenseNotes: "Apache-2.0; CNCF incubating. Full Linux VMs via Virtualization.framework. Confirmed at tag 2026-10-28.",
    hostPlatforms: ["darwin", "linux"],
    preferredTiers: ["full-vm"],
    snapshotSpikePriority: null,
    publishGradeOnDedicatedLinux: false,
    rejectedAlternatives: ["Tart (source-available / commercial restrictions)"],
  },
  {
    id: "agent-substrate",
    displayName: "Agent Substrate (Cloud Hypervisor / gVisor)",
    repository: "https://github.com/google/agent-substrate",
    pinnedVersion: "control-plane-adapter",
    licenseSpdx: "Apache-2.0",
    licenseNotes: "ADR 0011 primary in-cluster path; Cloud Hypervisor Apache-2.0/BSD.",
    hostPlatforms: ["linux"],
    preferredTiers: ["microvm", "gvisor"],
    snapshotSpikePriority: null,
    publishGradeOnDedicatedLinux: true,
  },
];

export function listIsolationBackendPinsEffect(): Effect.Effect<readonly IsolationBackendPin[]> {
  return Effect.succeed(ISOLATION_BACKEND_PINS);
}

export function getIsolationBackendPinEffect(
  id: IsolationBackendId
): Effect.Effect<IsolationBackendPin, { readonly _tag: "UnknownIsolationBackend"; readonly id: string }> {
  return Effect.gen(function* () {
    const pin = ISOLATION_BACKEND_PINS.find((p) => p.id === id);
    if (!pin) {
      return yield* Effect.fail({ _tag: "UnknownIsolationBackend" as const, id });
    }
    return pin;
  });
}

export function getIsolationBackendPin(id: IsolationBackendId): IsolationBackendPin {
  const pin = ISOLATION_BACKEND_PINS.find((p) => p.id === id);
  if (!pin) throw new Error(`unknown isolation backend pin: ${id}`);
  return pin;
}

export type IsolationLicenseAuditResult = {
  readonly ok: boolean;
  readonly checkedAt: string;
  readonly allowlist: readonly string[];
  readonly violations: readonly {
    readonly id: string;
    readonly licenseSpdx: string;
    readonly reason: string;
  }[];
  readonly pins: readonly IsolationBackendPin[];
};

/** Fail if any pin uses a license outside the OSI allowlist. */
export function auditIsolationBackendLicensesEffect(
  checkedAt: string = new Date().toISOString()
): Effect.Effect<IsolationLicenseAuditResult> {
  return Effect.sync(() => {
    const allow = new Set<string>(ISOLATION_OSI_LICENSE_ALLOWLIST);
    const violations = ISOLATION_BACKEND_PINS.filter((p) => !allow.has(p.licenseSpdx)).map(
      (p) => ({
        id: p.id,
        licenseSpdx: p.licenseSpdx,
        reason: `license ${p.licenseSpdx} not in OSI allowlist`,
      })
    );
    return {
      ok: violations.length === 0,
      checkedAt,
      allowlist: [...ISOLATION_OSI_LICENSE_ALLOWLIST],
      violations,
      pins: ISOLATION_BACKEND_PINS,
    } satisfies IsolationLicenseAuditResult;
  });
}

export function auditIsolationBackendLicenses(
  checkedAt?: string
): IsolationLicenseAuditResult {
  return Effect.runSync(auditIsolationBackendLicensesEffect(checkedAt));
}
