/**
 * Platform adapters for Layer C TEE signing.
 * `simulated` is software-only; hardware platforms fail closed until host wiring lands.
 */

import { Data, Effect } from "effect";

export type TeePlatformId = "simulated" | "sev-snp" | "tdx" | "nitro";

export type TeeAttestationSnapshot = {
  readonly platform: TeePlatformId;
  readonly reportBase64: string;
  readonly measurementId?: string;
};

export class TeePlatformError extends Data.TaggedError("TeePlatformError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type TeePlatformAdapter = {
  readonly platform: TeePlatformId;
  getAttestation: () => Effect.Effect<TeeAttestationSnapshot, TeePlatformError>;
};

export type SimulatedPlatformAdapterOptions = {
  readonly measurementId?: string;
  readonly note?: string;
};

/** Software-only attestation for dev/CI — not hardware-backed. */
export const createSimulatedPlatformAdapter = (
  options: SimulatedPlatformAdapterOptions = {}
): TeePlatformAdapter => {
  const measurementId = options.measurementId ?? "simulated-measurement";
  const report = {
    platform: "simulated" as const,
    measurementId,
    note:
      options.note ??
      "Software simulated TEE — replace with clawql-tee hardware adapter when SEV-SNP/TDX/Nitro is available.",
    generatedAt: new Date().toISOString(),
  };
  return {
    platform: "simulated",
    getAttestation: () =>
      Effect.succeed({
        platform: "simulated",
        measurementId,
        reportBase64: Buffer.from(JSON.stringify(report), "utf8").toString("base64"),
      }),
  };
};

const unsupportedHardware = (platform: Exclude<TeePlatformId, "simulated">): TeePlatformAdapter => ({
  platform,
  getAttestation: () =>
    Effect.fail(
      new TeePlatformError({
        message: `${platform} attestation requires clawql-tee hardware integration (not available in this build)`,
      })
    ),
});

/** Placeholder adapters — explicit fail until hardware paths ship. */
export const createHardwarePlatformAdapter = (
  platform: Exclude<TeePlatformId, "simulated">
): TeePlatformAdapter => unsupportedHardware(platform);

export type ResolveTeePlatformFromEnvOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly simulated?: SimulatedPlatformAdapterOptions;
};

function envTrim(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const v = env[key]?.trim();
  return v || undefined;
}

/** Resolve platform adapter from `CLAWQL_TEE_PLATFORM` (default `simulated`). */
export const resolveTeePlatformFromEnv = (
  options: ResolveTeePlatformFromEnvOptions = {}
): Effect.Effect<TeePlatformAdapter, TeePlatformError> => {
  const env = options.env ?? process.env;
  const raw = envTrim(env, "CLAWQL_TEE_PLATFORM") ?? "simulated";
  switch (raw) {
    case "simulated":
      return Effect.succeed(
        createSimulatedPlatformAdapter({
          measurementId: envTrim(env, "CLAWQL_TEE_MEASUREMENT_ID"),
          ...options.simulated,
        })
      );
    case "sev-snp":
      return Effect.succeed(createHardwarePlatformAdapter("sev-snp"));
    case "tdx":
      return Effect.succeed(createHardwarePlatformAdapter("tdx"));
    case "nitro":
      return Effect.succeed(createHardwarePlatformAdapter("nitro"));
    default:
      return Effect.fail(
        new TeePlatformError({
          message: `Unknown CLAWQL_TEE_PLATFORM=${raw} (expected simulated|sev-snp|tdx|nitro)`,
        })
      );
  }
};

export const teeStrictFromEnv = (env: NodeJS.ProcessEnv = process.env): boolean =>
  envTrim(env, "CLAWQL_TEE_STRICT") === "1";
