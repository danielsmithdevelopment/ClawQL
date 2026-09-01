/**
 * ECDSA P-256 signing for WORM entry hashes (Phase 3).
 * Simulated software keys for now; hardware clawql-tee plugs the same {@link TEESigner} surface later.
 */

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
  type KeyObject,
} from "node:crypto";
import { Effect } from "effect";
import { AuditError } from "../errors.js";
import type { TEEAttestationReport, TEESigner } from "./signer.js";

/** NIST P-256 / prime256v1 — common for TEE attestation tokens. */
export const TEE_ECDSA_CURVE = "prime256v1" as const;

export type TEEKeyPairPem = {
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
};

export const generateTeeKeyPairPem = (): Effect.Effect<TEEKeyPairPem, AuditError> =>
  Effect.try({
    try: () => {
      const { privateKey, publicKey } = generateKeyPairSync("ec", {
        namedCurve: TEE_ECDSA_CURVE,
      });
      return {
        privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
        publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      };
    },
    catch: (cause) =>
      new AuditError({
        reason: `TEE keypair generation failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
      }),
  });

function loadPrivateKey(pem: string): Effect.Effect<KeyObject, AuditError> {
  return Effect.try({
    try: () => createPrivateKey(pem),
    catch: (cause) =>
      new AuditError({
        reason: `Invalid TEE private key PEM: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
      }),
  });
}

function loadPublicKey(pem: string): Effect.Effect<KeyObject, AuditError> {
  return Effect.try({
    try: () => createPublicKey(pem),
    catch: (cause) =>
      new AuditError({
        reason: `Invalid TEE public key PEM: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
      }),
  });
}

/** Sign a hex SHA-256 entry hash; returns base64 DER ECDSA signature. */
export const signEntryHashEcdsa = (
  hashHex: string,
  privateKeyPem: string
): Effect.Effect<string, AuditError> =>
  Effect.gen(function* () {
    if (!/^[a-fA-F0-9]{64}$/.test(hashHex)) {
      return yield* Effect.fail(
        new AuditError({
          reason: `TEE sign expects 64-char hex hash, got length ${hashHex.length}`,
        })
      );
    }
    const key = yield* loadPrivateKey(privateKeyPem);
    return yield* Effect.try({
      try: () => {
        const sig = nodeSign(null, Buffer.from(hashHex, "hex"), {
          key,
          dsaEncoding: "der",
        });
        return sig.toString("base64");
      },
      catch: (cause) =>
        new AuditError({
          reason: `TEE ECDSA sign failed: ${cause instanceof Error ? cause.message : String(cause)}`,
          cause,
        }),
    });
  });

/** Verify base64 DER ECDSA signature over hex entry hash. */
export const verifyEntryHashEcdsa = (
  hashHex: string,
  signatureBase64: string,
  publicKeyPem: string
): Effect.Effect<boolean, AuditError> =>
  Effect.gen(function* () {
    if (!/^[a-fA-F0-9]{64}$/.test(hashHex)) return false;
    const key = yield* loadPublicKey(publicKeyPem);
    return yield* Effect.try({
      try: () =>
        nodeVerify(
          null,
          Buffer.from(hashHex, "hex"),
          { key, dsaEncoding: "der" },
          Buffer.from(signatureBase64, "base64")
        ),
      catch: (cause) =>
        new AuditError({
          reason: `TEE ECDSA verify failed: ${cause instanceof Error ? cause.message : String(cause)}`,
          cause,
        }),
    });
  });

export type CreateEcdsaTeeSignerOptions = {
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
  readonly platform?: TEEAttestationReport["platform"];
};

/**
 * Software ECDSA P-256 signer implementing {@link TEESigner}.
 * `platform: "simulated"` until clawql-tee hardware attestation lands.
 */
export const createEcdsaTeeSigner = (
  options: CreateEcdsaTeeSignerOptions
): Effect.Effect<
  TEESigner & { readonly publicKeyPem: string; readonly attestation: TEEAttestationReport },
  AuditError
> =>
  Effect.gen(function* () {
    // Validate keys early
    yield* loadPrivateKey(options.privateKeyPem);
    yield* loadPublicKey(options.publicKeyPem);
    const platform = options.platform ?? "simulated";
    const attestation: TEEAttestationReport = {
      platform,
      reportBase64: Buffer.from(
        JSON.stringify({
          platform,
          algo: "ECDSA_P256",
          publicKeyPem: options.publicKeyPem,
          note:
            platform === "simulated"
              ? "Software ECDSA — not hardware-attested. Replace with clawql-tee SEV-SNP/TDX when available."
              : "Hardware attestation report placeholder",
        }),
        "utf8"
      ).toString("base64"),
    };

    const signer: TEESigner & {
      readonly publicKeyPem: string;
      readonly attestation: TEEAttestationReport;
    } = {
      publicKeyPem: options.publicKeyPem,
      attestation,
      sign: (hash) => signEntryHashEcdsa(hash, options.privateKeyPem),
    };
    return signer;
  });

/** Generate an ephemeral simulated TEE signer (tests / local without key material). */
export const createSimulatedTeeSigner = (): Effect.Effect<
  TEESigner & {
    readonly publicKeyPem: string;
    readonly privateKeyPem: string;
    readonly attestation: TEEAttestationReport;
  },
  AuditError
> =>
  Effect.gen(function* () {
    const pair = yield* generateTeeKeyPairPem();
    const base = yield* createEcdsaTeeSigner({
      privateKeyPem: pair.privateKeyPem,
      publicKeyPem: pair.publicKeyPem,
      platform: "simulated",
    });
    return { ...base, privateKeyPem: pair.privateKeyPem };
  });
