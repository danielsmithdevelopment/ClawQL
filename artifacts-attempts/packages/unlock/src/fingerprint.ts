import { createHash } from "node:crypto";

/**
 * Per-buyer watermarks. Deterrence + attribution — not DRM.
 * A stripped leak loses verifiable provenance (buyer-named manifest).
 */

export type BuyerIdentity = {
  /** Stable buyer id (wallet, agent id, or email hash). */
  buyerId: string;
  /** Payment receipt / facilitator proof id. */
  receipt: string;
};

export type BuyerCopy = {
  /** Fingerprinted plaintext files. */
  files: Array<{ path: string; bytes: Buffer }>;
  /** Signed-shaped buyer manifest (JSON). */
  buyerManifest: BuyerManifest;
};

export type BuyerManifest = {
  version: "1";
  kind: "buyer-copy";
  buyerId: string;
  receipt: string;
  plaintextSha256: string;
  fingerprint: string;
  issuedAt: string;
  note: string;
};

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function buyerFingerprint(buyer: BuyerIdentity): string {
  return sha256Hex(`${buyer.buyerId}:${buyer.receipt}`).slice(0, 32);
}

/**
 * Stamp a text/code bundle with a buyer comment + metadata file.
 * Binary paths are left unchanged; BUYER.txt + fingerprint comment carry the mark.
 */
export function stampBuyerCopy(input: {
  plaintextFiles: Array<{ path: string; bytes: Buffer | Uint8Array }>;
  buyer: BuyerIdentity;
  plaintextSha256: string;
  issuedAt?: string;
}): BuyerCopy {
  const fingerprint = buyerFingerprint(input.buyer);
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const stampLine = `\n/* artifacts-attempts buyer=${input.buyer.buyerId} fp=${fingerprint} */\n`;

  const files: Array<{ path: string; bytes: Buffer }> = input.plaintextFiles.map((f) => {
    const buf = Buffer.from(f.bytes);
    if (/\.(ts|js|mjs|cjs|json|md|txt)$/i.test(f.path) || f.path === "README") {
      return { path: f.path, bytes: Buffer.concat([buf, Buffer.from(stampLine)]) };
    }
    return { path: f.path, bytes: buf };
  });

  const buyerTxt = [
    `# Buyer copy — not the public ciphertext`,
    `buyerId: ${input.buyer.buyerId}`,
    `receipt: ${input.buyer.receipt}`,
    `fingerprint: ${fingerprint}`,
    `issuedAt: ${issuedAt}`,
    ``,
    `Leaking this copy without provenance is detectable only if markers remain.`,
    `Stripping markers makes the copy unverifiable against the buyer manifest.`,
    ``,
  ].join("\n");
  files.push({ path: "BUYER.txt", bytes: Buffer.from(buyerTxt) });

  const buyerManifest: BuyerManifest = {
    version: "1",
    kind: "buyer-copy",
    buyerId: input.buyer.buyerId,
    receipt: input.buyer.receipt,
    plaintextSha256: input.plaintextSha256,
    fingerprint,
    issuedAt,
    note: "Per-buyer Artifacts delivery. Leak prevention is impossible; attribution is the goal.",
  };
  files.push({
    path: "buyer-manifest.json",
    bytes: Buffer.from(JSON.stringify(buyerManifest, null, 2) + "\n"),
  });

  return { files, buyerManifest };
}
