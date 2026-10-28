/**
 * Host + pinned-backend metadata for every isolation evidence file.
 * Record Mac model + macOS version on Darwin; pin the backend version.
 */

import { createHash } from "node:crypto";
import os from "node:os";
import { Effect } from "effect";
import type { IsolationBackendId } from "./types.js";
import { getIsolationBackendPin } from "./license-registry.js";

export type IsolationHostEvidence = {
  readonly recordedAt: string;
  readonly hostname: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly osRelease: string;
  /** Darwin only — e.g. "15.0"; empty on Linux CI. */
  readonly macOsVersion: string;
  /** Darwin only — e.g. "MacBook Pro (M2 Pro)"; empty when unknown. */
  readonly macModel: string;
  readonly nodeVersion: string;
  readonly backendId: IsolationBackendId;
  readonly backendPinnedVersion: string;
  readonly backendLicenseSpdx: string;
  /**
   * False for Mac VM backends (Apple container / Lima). Firecracker /
   * gVisor on the dedicated Linux host may set true via the pin registry.
   */
  readonly publishGradeAllowed: boolean;
};

export function collectIsolationHostEvidenceEffect(
  backendId: IsolationBackendId = "firecracker",
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<IsolationHostEvidence> {
  return Effect.sync(() => {
    const pin = getIsolationBackendPin(
      backendId === "mock" ? "firecracker" : backendId
    );
    const overrideRelease = env.CLAWQL_ISOLATION_HOST_OS_RELEASE?.trim();
    return {
      recordedAt: new Date().toISOString(),
      hostname: env.HOSTNAME?.trim() || env.HOST?.trim() || os.hostname() || "unknown",
      platform: process.platform,
      arch: process.arch,
      osRelease: overrideRelease || os.release(),
      macOsVersion: env.CLAWQL_ISOLATION_HOST_MACOS_VERSION?.trim() || "",
      macModel: env.CLAWQL_ISOLATION_HOST_MAC_MODEL?.trim() || "",
      nodeVersion: process.version,
      backendId,
      backendPinnedVersion: pin.pinnedVersion,
      backendLicenseSpdx: pin.licenseSpdx,
      publishGradeAllowed: pin.publishGradeOnDedicatedLinux,
    } satisfies IsolationHostEvidence;
  });
}

/** Sync façade for evidence writers at host edges. */
export function collectIsolationHostEvidence(
  backendId?: IsolationBackendId,
  env?: NodeJS.ProcessEnv
): IsolationHostEvidence {
  return Effect.runSync(collectIsolationHostEvidenceEffect(backendId, env));
}

export function evidencePayloadDigestEffect(payload: unknown): Effect.Effect<string> {
  return Effect.sync(() =>
    createHash("sha256").update(JSON.stringify(payload)).digest("hex")
  );
}

export function evidencePayloadDigest(payload: unknown): string {
  return Effect.runSync(evidencePayloadDigestEffect(payload));
}
