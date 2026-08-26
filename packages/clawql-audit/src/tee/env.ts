/**
 * Resolve optional TEE signer from process env for WORM trail boot.
 *
 * CLAWQL_WORM_TEE=1 — attach ECDSA P-256 signatures on append (`teeSignature`).
 * CLAWQL_WORM_TEE_PLATFORM=simulated|sev-snp|tdx (default simulated).
 * CLAWQL_WORM_TEE_PRIVATE_KEY_PEM / CLAWQL_WORM_TEE_PUBLIC_KEY_PEM — optional PEM pair;
 * when omitted under simulated, an ephemeral keypair is generated at boot.
 */

import { readFileSync } from "node:fs";
import { Effect } from "effect";
import { AuditError } from "../errors.js";
import { createEcdsaTeeSigner, createSimulatedTeeSigner } from "./ecdsa.js";
import type { TEEAttestationReport, TEESigner } from "./signer.js";

function envTrim(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const v = env[key]?.trim();
  return v || undefined;
}

function envFlag(env: NodeJS.ProcessEnv, key: string): boolean {
  const v = envTrim(env, key)?.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function readPemFromEnv(env: NodeJS.ProcessEnv, pemKey: string, pathKey: string): string | undefined {
  const inline = envTrim(env, pemKey);
  if (inline) return inline;
  const path = envTrim(env, pathKey);
  if (!path) return undefined;
  return readFileSync(path, "utf8");
}

const PLATFORMS = new Set<TEEAttestationReport["platform"]>(["simulated", "sev-snp", "tdx"]);

function parsePlatform(env: NodeJS.ProcessEnv): TEEAttestationReport["platform"] | undefined {
  const raw = envTrim(env, "CLAWQL_WORM_TEE_PLATFORM") ?? "simulated";
  if (!PLATFORMS.has(raw as TEEAttestationReport["platform"])) {
    return undefined;
  }
  return raw as TEEAttestationReport["platform"];
}

/** Build a {@link TEESigner} from env, or `undefined` when TEE is disabled. */
export const createWormTeeSignerFromEnvEffect = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<TEESigner | undefined, AuditError> =>
  Effect.gen(function* () {
    if (!envFlag(env, "CLAWQL_WORM_TEE")) return undefined;

    const platform = parsePlatform(env);
    if (!platform) {
      return yield* Effect.fail(
        new AuditError({
          reason: `Unknown CLAWQL_WORM_TEE_PLATFORM (expected simulated|sev-snp|tdx)`,
        })
      );
    }

    if (platform !== "simulated") {
      return yield* Effect.fail(
        new AuditError({
          reason: `CLAWQL_WORM_TEE_PLATFORM=${platform} requires clawql-tee hardware adapter (not wired in-process yet)`,
        })
      );
    }

    const privateKeyPem = readPemFromEnv(
      env,
      "CLAWQL_WORM_TEE_PRIVATE_KEY_PEM",
      "CLAWQL_WORM_TEE_PRIVATE_KEY_PEM_PATH"
    );
    const publicKeyPem = readPemFromEnv(
      env,
      "CLAWQL_WORM_TEE_PUBLIC_KEY_PEM",
      "CLAWQL_WORM_TEE_PUBLIC_KEY_PEM_PATH"
    );

    if (privateKeyPem && publicKeyPem) {
      return yield* createEcdsaTeeSigner({
        privateKeyPem,
        publicKeyPem,
        platform: "simulated",
      });
    }

    if (privateKeyPem || publicKeyPem) {
      return yield* Effect.fail(
        new AuditError({
          reason:
            "CLAWQL_WORM_TEE requires both private and public PEM (or neither for ephemeral simulated keys)",
        })
      );
    }

    return yield* createSimulatedTeeSigner();
  });
