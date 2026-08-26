/**
 * Optional TEE attestation hooks (Phase 3).
 * ECDSA P-256 sign/verify ships in-package; hardware SEV-SNP/TDX via clawql-tee later.
 */

import { Effect } from "effect";
import type { WORMEntry } from "../entry.js";
import { verifyEntryHashEcdsa } from "./ecdsa.js";

export type TEESigner = {
  readonly sign: (hash: string) => Effect.Effect<string, import("../errors.js").AuditError>;
};

export type TEEAttestationReport = {
  readonly reportBase64: string;
  readonly platform: "sev-snp" | "tdx" | "simulated";
};

export type VerifyTeeSignatureResult = {
  readonly valid: boolean;
  readonly reason?: string;
};

/**
 * Verify {@link WORMEntry.teeSignature} (base64 DER ECDSA-P256) over {@link WORMEntry.hash}.
 * Attestation report is recorded for auditors; hardware KDS/PCS validation is clawql-tee follow-up.
 */
export const verifyTEESignature = (
  entry: WORMEntry,
  publicKeyPem: string,
  attestationReport?: TEEAttestationReport
): Effect.Effect<VerifyTeeSignatureResult> =>
  Effect.gen(function* () {
    if (!entry.teeSignature) {
      return { valid: false, reason: "No TEE signature present" };
    }
    const verified = yield* verifyEntryHashEcdsa(
      entry.hash,
      entry.teeSignature,
      publicKeyPem
    ).pipe(
      Effect.map((ok) => ({ ok, error: undefined as string | undefined })),
      Effect.catchAll((err) => Effect.succeed({ ok: false, error: err.reason }))
    );
    if (verified.error) {
      return { valid: false, reason: verified.error };
    }
    if (!verified.ok) {
      return { valid: false, reason: "ECDSA signature mismatch" };
    }
    if (attestationReport?.platform === "simulated") {
      return {
        valid: true,
        reason: "ECDSA valid (simulated TEE — not hardware-attested)",
      };
    }
    if (
      attestationReport?.platform === "sev-snp" ||
      attestationReport?.platform === "tdx"
    ) {
      return {
        valid: true,
        reason: `ECDSA valid; hardware attestation (${attestationReport.platform}) not yet verified by clawql-tee`,
      };
    }
    return { valid: true };
  });

export {
  createEcdsaTeeSigner,
  createSimulatedTeeSigner,
  generateTeeKeyPairPem,
  signEntryHashEcdsa,
  TEE_ECDSA_CURVE,
  verifyEntryHashEcdsa,
  type CreateEcdsaTeeSignerOptions,
  type TEEKeyPairPem,
} from "./ecdsa.js";
