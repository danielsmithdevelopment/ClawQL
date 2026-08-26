/**
 * Optional TEE attestation hooks (Phase 3). Types only for Phase 1 wiring.
 */

import { Effect } from "effect";
import type { WORMEntry } from "../entry.js";
import { AuditError } from "../errors.js";

export type TEESigner = {
  readonly sign: (hash: string) => Effect.Effect<string, AuditError>;
};

export type TEEAttestationReport = {
  readonly reportBase64: string;
  readonly platform: "sev-snp" | "tdx" | "simulated";
};

export const verifyTEESignature = (
  entry: WORMEntry,
  _publicKeyPem: string,
  _attestationReport: TEEAttestationReport
): Effect.Effect<{ valid: boolean; reason?: string }> =>
  Effect.sync(() => {
    if (!entry.teeSignature) {
      return { valid: false, reason: "No TEE signature present" };
    }
    // Phase 3: ECDSA verify + attestation report validation.
    return {
      valid: false,
      reason: "TEE verification ships in Phase 3 (clawql-tee integration)",
    };
  });
