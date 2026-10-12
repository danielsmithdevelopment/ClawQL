#!/usr/bin/env npx tsx
/**
 * Offline x402 unlock dry-run for filming prep.
 * Encrypts a tiny bundle, issues a dry-run receipt, writes a buyer-stamped copy under .local/unlock/.
 *
 *   npm run demo:unlock-dry
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildPaymentRequired,
  encryptRelease,
  fulfillUnlock,
  publicCipherMeta,
  verifyPayment,
} from "@artifacts-attempts/unlock";

const root = join(process.cwd(), ".local", "unlock");
mkdirSync(root, { recursive: true });

const plaintextFiles = [
  { path: "RELEASE.md", bytes: Buffer.from("# unlock demo release\nparallel agents → permanent merge\n") },
  { path: "src/index.ts", bytes: Buffer.from("export const release = true;\n") },
];
const concatenated = Buffer.concat(plaintextFiles.map((f) => f.bytes));
const encrypted = encryptRelease(concatenated);
const pub = publicCipherMeta(encrypted);

writeFileSync(join(root, "ciphertext.meta.json"), JSON.stringify(pub, null, 2) + "\n");
writeFileSync(join(root, "ciphertext.bin"), Buffer.from(encrypted.ciphertextHex, "hex"));
// Key stays local for dry-run only — never publish.
writeFileSync(join(root, "content-key.hex"), encrypted.keyHex + "\n", { mode: 0o600 });

const challenge = buildPaymentRequired({
  resource: "http://127.0.0.1:8788/unlock",
  payTo: "0xdemo",
  maxAmountRequired: "10000",
  network: "base-sepolia",
});
const payment = await verifyPayment({ resource: challenge.accepts[0]!.resource, challenge, dryRun: true });
const { copy, fulfillment } = await fulfillUnlock({
  encrypted,
  plaintextFiles,
  payment,
});

const buyerDir = join(root, "buyer-copy");
mkdirSync(buyerDir, { recursive: true });
for (const f of copy.files) {
  const p = join(buyerDir, f.path);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, f.bytes);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      mode: fulfillment.mode,
      payment: { mode: payment.mode, receipt: payment.receipt },
      buyerManifest: copy.buyerManifest,
      ciphertextMeta: join(root, "ciphertext.meta.json"),
      buyerCopy: buyerDir,
      filmLabel: "x402 unlock dry-run — Base Sepolia live when facilitator + payTo are set",
      next: ["docs/X402_UNLOCK.md", "docs/HUMAN_NEXT.md"],
    },
    null,
    2
  )
);
console.log("\nUNLOCK DRY-RUN PASS");
