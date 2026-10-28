/**
 * Pinned Cua SDK coordinates (ADR 0018).
 * Optional peer — never a hard dependency of clawql-sandbox.
 *
 * License (checked 2026-10-28):
 * - Core SDK / Driver / Lume: MIT
 * - Cua Spaces: FSL-1.1-MIT — free to use, modify, self-host commercially;
 *   offering Spaces (or substantially similar) as a hosted/managed service
 *   requires a commercial licence from Cua (licensing@trycua.com).
 * ClawQL uses Spaces as an optional isolation backend for self-hosted runners,
 * not as a competing hosted Spaces product — FSL Competing Use does not block.
 */

import { Effect } from "effect";

/** npm package name for the TypeScript Cua SDK. */
export const PINNED_CUA_NPM_PACKAGE = "@trycua/cua" as const;

/** Pinned version string recorded in every evidence file. */
export const PINNED_CUA_NPM_VERSION = "0.9.0" as const;

export const PINNED_CUA_NPM_SPEC = `${PINNED_CUA_NPM_PACKAGE}@${PINNED_CUA_NPM_VERSION}` as const;

export type CuaLicenseVerdict = {
  readonly allowedForSelfHostedIsolationBackend: boolean;
  readonly spacesLicense: "FSL-1.1-MIT";
  readonly sdkLicense: "MIT";
  readonly competingHostedSpacesRequiresCommercial: boolean;
  readonly checkedAt: string;
  readonly notes: string;
};

/** License gate — Effect primary so env/config readers stay Effect-shaped. */
export function cuaLicenseVerdictEffect(
  checkedAt: string = new Date().toISOString()
): Effect.Effect<CuaLicenseVerdict> {
  return Effect.succeed({
    allowedForSelfHostedIsolationBackend: true,
    spacesLicense: "FSL-1.1-MIT",
    sdkLicense: "MIT",
    competingHostedSpacesRequiresCommercial: true,
    checkedAt,
    notes:
      "Self-host / in-house isolation backend OK under FSL-1.1-MIT. " +
      "Do not offer Cua Spaces (or a substantially similar product) as a " +
      "hosted/managed service without a Cua commercial licence.",
  });
}

export function cuaLicenseVerdict(checkedAt?: string): CuaLicenseVerdict {
  return Effect.runSync(cuaLicenseVerdictEffect(checkedAt));
}

/** Fail closed if a future override marks commercial use blocked. */
export function assertCuaLicenseAllowsWorkEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<
  CuaLicenseVerdict,
  { readonly _tag: "CuaLicenseBlocked"; readonly reason: string }
> {
  return Effect.gen(function* () {
    const forced = env.CLAWQL_CUA_LICENSE_BLOCK?.trim();
    if (forced === "1" || forced?.toLowerCase() === "true") {
      return yield* Effect.fail({
        _tag: "CuaLicenseBlocked" as const,
        reason: "CLAWQL_CUA_LICENSE_BLOCK=1 — Cua work halted by operator override",
      });
    }
    const verdict = yield* cuaLicenseVerdictEffect();
    if (!verdict.allowedForSelfHostedIsolationBackend) {
      return yield* Effect.fail({
        _tag: "CuaLicenseBlocked" as const,
        reason: "Cua license does not allow this use — work blocked",
      });
    }
    return verdict;
  });
}
