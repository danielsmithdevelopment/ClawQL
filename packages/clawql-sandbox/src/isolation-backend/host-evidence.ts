/**
 * Host + pinned-backend metadata for every Cua / isolation evidence file.
 * Shared rule: pin the Cua version and record Mac model + macOS version.
 */

import { createHash } from "node:crypto";
import os from "node:os";
import { Effect } from "effect";
import { PINNED_CUA_NPM_PACKAGE, PINNED_CUA_NPM_VERSION } from "../cua/pinned-version.js";

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
  readonly cuaPinnedPackage: string;
  readonly cuaPinnedVersion: string;
  /**
   * Always false for Cua-backed runs. VM overhead adds noise —
   * publish-grade results stay on the dedicated Linux host.
   */
  readonly publishGradeAllowed: boolean;
};

export function collectIsolationHostEvidenceEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<IsolationHostEvidence> {
  return Effect.sync(() => {
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
      cuaPinnedPackage: PINNED_CUA_NPM_PACKAGE,
      cuaPinnedVersion: PINNED_CUA_NPM_VERSION,
      publishGradeAllowed: false,
    } satisfies IsolationHostEvidence;
  });
}

/** Sync façade for evidence writers at host edges. */
export function collectIsolationHostEvidence(env?: NodeJS.ProcessEnv): IsolationHostEvidence {
  return Effect.runSync(collectIsolationHostEvidenceEffect(env));
}

export function evidencePayloadDigestEffect(payload: unknown): Effect.Effect<string> {
  return Effect.sync(() => createHash("sha256").update(JSON.stringify(payload)).digest("hex"));
}

export function evidencePayloadDigest(payload: unknown): string {
  return Effect.runSync(evidencePayloadDigestEffect(payload));
}
