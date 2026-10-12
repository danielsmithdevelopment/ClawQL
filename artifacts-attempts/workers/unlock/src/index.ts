/**
 * x402 unlock Worker — contest closing beat.
 *
 * GET  /unlock → 402 PAYMENT-REQUIRED (or dry-run challenge JSON)
 * POST /unlock → verify payment, decrypt, return buyer-stamped copy metadata
 *               (+ Artifacts repo name when binding/env is wired)
 *
 * Key custody: Worker-held for the contest. Lit is a later upgrade.
 * Leak prevention: impossible. Attribution via buyer-manifest + fingerprint.
 */

import {
  buildPaymentRequired,
  decryptAndStamp,
  encryptRelease,
  paymentRequiredHeaders,
  verifyPayment,
  type EncryptedReleaseWithKey,
} from "@artifacts-attempts/unlock";

export type UnlockEnv = {
  UNLOCK_PAY_TO?: string;
  UNLOCK_PRICE_ATOMIC?: string;
  UNLOCK_NETWORK?: string;
  UNLOCK_DRY_RUN?: string;
  X402_FACILITATOR_URL?: string;
  /** Hex AES-256 key; demo generates ephemeral if unset (not for production). */
  UNLOCK_CONTENT_KEY_HEX?: string;
};

/** Demo plaintext — replace with real release bytes in production wiring. */
const DEMO_PLAIN = Buffer.from(
  "# artifacts-attempts unlock demo\n\nPermanent ciphertext on Arweave; plaintext via private Artifacts after x402.\n"
);

function demoEncrypted(env: UnlockEnv): EncryptedReleaseWithKey {
  const key = env.UNLOCK_CONTENT_KEY_HEX
    ? Buffer.from(env.UNLOCK_CONTENT_KEY_HEX, "hex")
    : undefined;
  return encryptRelease(DEMO_PLAIN, key);
}

export default {
  async fetch(request: Request, env: UnlockEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return Response.json({ ok: true, service: "unlock" });
    }
    if (url.pathname !== "/unlock") {
      return new Response("not found", { status: 404 });
    }

    const dryRun = env.UNLOCK_DRY_RUN !== "0";
    const challenge = buildPaymentRequired({
      resource: `${url.origin}/unlock`,
      payTo: env.UNLOCK_PAY_TO ?? "0x0000000000000000000000000000000000000000",
      maxAmountRequired: env.UNLOCK_PRICE_ATOMIC ?? "10000",
      network: env.UNLOCK_NETWORK ?? "base-sepolia",
      description: "Decrypt release + private Artifacts buyer copy ($0.01 USDC testnet)",
    });

    if (request.method === "GET") {
      const headers = paymentRequiredHeaders(challenge);
      return new Response(JSON.stringify(challenge, null, 2), {
        status: 402,
        headers,
      });
    }

    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }

    const payment = await verifyPayment({
      resource: `${url.origin}/unlock`,
      paymentHeader: request.headers.get("PAYMENT-SIGNATURE"),
      dryRun,
      facilitatorUrl: env.X402_FACILITATOR_URL,
      challenge,
    });
    if (!payment.ok) {
      return Response.json({ ok: false, error: payment.detail }, { status: 402 });
    }

    const encrypted = demoEncrypted(env);
    const copy = decryptAndStamp({
      encrypted,
      plaintextFiles: [{ path: "RELEASE.md", bytes: DEMO_PLAIN }],
      payment,
    });

    return Response.json({
      ok: true,
      payment: { mode: payment.mode, receipt: payment.receipt, payer: payment.payer },
      buyerManifest: copy.buyerManifest,
      files: copy.files.map((f) => ({
        path: f.path,
        // Return text for demo; production pushes into a private Artifacts repo instead.
        text: f.bytes.toString("utf8"),
      })),
      delivery: {
        intended: "private Artifacts repo + scoped token (wire createRestClient when CF creds live)",
        honesty:
          "Leak prevention is impossible after plaintext delivery; buyer-manifest enables attribution.",
      },
    });
  },
};
