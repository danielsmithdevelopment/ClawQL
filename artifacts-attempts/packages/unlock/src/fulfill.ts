/**
 * After payment: decrypt → stamp buyer copy → deliver via private Artifacts repo (or local dry-run).
 */

import type { ArtifactsClient } from "@artifacts-attempts/artifacts-client";
import { decryptRelease, type EncryptedReleaseWithKey } from "./crypto.js";
import { stampBuyerCopy, type BuyerCopy, type BuyerIdentity } from "./fingerprint.js";
import type { X402VerifyResult } from "./x402.js";

export type UnlockFulfillment = {
  mode: "artifacts" | "local-dry-run";
  buyer: BuyerIdentity;
  payment: X402VerifyResult;
  buyerManifest: BuyerCopy["buyerManifest"];
  /** Private Artifacts repo name when live. */
  artifactsRepo?: string;
  /** Repo-scoped read token (live). */
  token?: string;
  /** Local directory listing of stamped files (dry-run). */
  localFiles?: string[];
};

export function buildBuyerId(payer: string | undefined, receipt: string): string {
  return (payer?.trim() || `buyer_${receipt.slice(0, 12)}`).toLowerCase();
}

export function decryptAndStamp(input: {
  encrypted: EncryptedReleaseWithKey;
  /** Original plaintext file layout before encryption (paths + bytes). */
  plaintextFiles: Array<{ path: string; bytes: Buffer | Uint8Array }>;
  payment: X402VerifyResult;
}): BuyerCopy {
  // Prove the held key decrypts the public ciphertext.
  const plain = decryptRelease(input.encrypted);
  void plain;
  const buyer: BuyerIdentity = {
    buyerId: buildBuyerId(input.payment.payer, input.payment.receipt),
    receipt: input.payment.receipt,
  };
  return stampBuyerCopy({
    plaintextFiles: input.plaintextFiles,
    buyer,
    plaintextSha256: input.encrypted.plaintextSha256,
  });
}

/**
 * Live delivery: create a private-named Artifacts repo for the buyer.
 * Pushing file contents still requires git remote + token (operator wires push).
 * Here we create the repo + write token and return stamped files for the caller to push.
 */
export async function fulfillUnlock(input: {
  encrypted: EncryptedReleaseWithKey;
  plaintextFiles: Array<{ path: string; bytes: Buffer | Uint8Array }>;
  payment: X402VerifyResult;
  artifacts?: ArtifactsClient;
  namespaceHint?: string;
}): Promise<{ copy: BuyerCopy; fulfillment: UnlockFulfillment }> {
  const copy = decryptAndStamp({
    encrypted: input.encrypted,
    plaintextFiles: input.plaintextFiles,
    payment: input.payment,
  });
  const buyer = {
    buyerId: copy.buyerManifest.buyerId,
    receipt: copy.buyerManifest.receipt,
  };

  if (!input.artifacts) {
    return {
      copy,
      fulfillment: {
        mode: "local-dry-run",
        buyer,
        payment: input.payment,
        buyerManifest: copy.buyerManifest,
        localFiles: copy.files.map((f) => f.path),
      },
    };
  }

  const safeBuyer = buyer.buyerId.replace(/[^a-z0-9_-]/gi, "-").slice(0, 40);
  const repoName = `unlock-${safeBuyer}-${copy.buyerManifest.fingerprint.slice(0, 8)}`;
  await input.artifacts.create(repoName, {
    description: `Buyer copy for ${buyer.buyerId} (x402 unlock)`,
  });
  const token = await input.artifacts.createToken(repoName, "write", 3600);

  return {
    copy,
    fulfillment: {
      mode: "artifacts",
      buyer,
      payment: input.payment,
      buyerManifest: copy.buyerManifest,
      artifactsRepo: repoName,
      token: token.plaintext,
    },
  };
}
