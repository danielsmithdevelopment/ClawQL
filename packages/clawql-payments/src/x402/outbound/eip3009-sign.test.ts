/**
 * EIP-3009 signer — real viem typed-data payload (no network).
 */

import { createMemorySecretStore } from "clawql-auth";
import { Effect, ManagedRuntime } from "effect";
import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createX402SignerLayer, signerSecretPath, X402SignerService } from "./signer-service.js";
import { computeQuoteDigest } from "./quote.js";
import type { OutboundX402QuoteTerms } from "./types.js";

describe("X402Signer EIP-3009", () => {
  it("signs TransferWithAuthorization and emits base64 X402PaymentPayloadV2", async () => {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    const store = createMemorySecretStore();
    const tenantId = "t-eip";
    const agentId = "a-eip";
    await Effect.runPromise(
      store.setSecret(
        signerSecretPath(tenantId, agentId),
        JSON.stringify({ address: account.address, privateKey: pk })
      )
    );

    const quote: OutboundX402QuoteTerms = {
      scheme: "exact",
      network: "eip155:84532",
      amountAtomic: "1000",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      payTo: "0x0000000000000000000000000000000000000EaD",
      maxTimeoutSeconds: 300,
      extra: { name: "USDC", version: "2" },
    };

    const runtime = ManagedRuntime.make(
      createX402SignerLayer({ mode: "secret-store", secretStore: store })
    );

    const signed = await runtime.runPromise(
      Effect.gen(function* () {
        const signer = yield* X402SignerService;
        return yield* signer.sign({
          tenantId,
          agentId,
          sessionId: "s1",
          resourceUrl: "https://api.example.com/paid",
          quote,
          quoteDigest: computeQuoteDigest(quote),
        });
      })
    );

    expect(signed.mode).toBe("eip3009");
    expect(signed.payerAddress.toLowerCase()).toBe(account.address.toLowerCase());
    const payload = JSON.parse(Buffer.from(signed.paymentHeader, "base64").toString("utf8")) as {
      x402Version: number;
      payload: { signature: string; authorization: { from: string; to: string; value: string } };
      accepted: { amount: string };
    };
    expect(payload.x402Version).toBe(2);
    expect(payload.payload.signature).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(payload.payload.authorization.value).toBe("1000");
    expect(payload.accepted.amount).toBe("1000");
    await runtime.dispose();
  });
});
