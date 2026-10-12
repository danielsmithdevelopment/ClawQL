import { describe, expect, it } from "vitest";
import { decryptRelease, encryptRelease, publicCipherMeta } from "./crypto.js";
import { stampBuyerCopy } from "./fingerprint.js";
import { fulfillUnlock } from "./fulfill.js";
import { buildPaymentRequired, verifyPayment } from "./x402.js";

describe("unlock crypto", () => {
  it("round-trips AES-GCM and strips key from public meta", () => {
    const plain = Buffer.from("hello permanent ciphertext");
    const enc = encryptRelease(plain);
    expect(decryptRelease(enc).toString()).toBe(plain.toString());
    const pub = publicCipherMeta(enc);
    expect("keyHex" in pub).toBe(false);
    expect(pub.plaintextSha256).toBe(enc.plaintextSha256);
  });
});

describe("buyer stamp", () => {
  it("adds BUYER.txt + fingerprint and names the buyer in the manifest", () => {
    const enc = encryptRelease(Buffer.from("body"));
    const copy = stampBuyerCopy({
      plaintextFiles: [{ path: "src/index.ts", bytes: Buffer.from("export const x = 1;\n") }],
      buyer: { buyerId: "0xabc", receipt: "rcpt_1" },
      plaintextSha256: enc.plaintextSha256,
      issuedAt: "2026-10-13T00:00:00.000Z",
    });
    expect(copy.buyerManifest.buyerId).toBe("0xabc");
    expect(copy.files.some((f) => f.path === "BUYER.txt")).toBe(true);
    expect(copy.files.some((f) => f.path === "buyer-manifest.json")).toBe(true);
    const src = copy.files.find((f) => f.path === "src/index.ts")!.bytes.toString();
    expect(src).toContain("buyer=0xabc");
    expect(src).toContain(`fp=${copy.buyerManifest.fingerprint}`);
  });
});

describe("x402 + fulfill dry-run", () => {
  it("issues dry-run receipt and local fulfillment", async () => {
    const challenge = buildPaymentRequired({
      resource: "/unlock/demo",
      payTo: "0xpay",
      maxAmountRequired: "10000",
      network: "base-sepolia",
    });
    const payment = await verifyPayment({
      resource: "/unlock/demo",
      challenge,
      dryRun: true,
    });
    expect(payment.ok).toBe(true);
    expect(payment.mode).toBe("dry-run");

    const plainFiles = [{ path: "RELEASE.md", bytes: Buffer.from("# release\n") }];
    const encrypted = encryptRelease(Buffer.concat(plainFiles.map((f) => f.bytes)));
    const { fulfillment } = await fulfillUnlock({
      encrypted,
      plaintextFiles: plainFiles,
      payment,
    });
    expect(fulfillment.mode).toBe("local-dry-run");
    expect(fulfillment.localFiles).toContain("BUYER.txt");
  });
});
