/**
 * EIP-3009 TransferWithAuthorization signing via optional `viem`.
 * Secret material never leaves this module except as a signature in the payload.
 */

import { randomBytes } from "node:crypto";
import { Effect } from "effect";
import { X402Error } from "../../errors/payment-errors.js";
import type { OutboundX402QuoteTerms } from "./types.js";

export type Eip3009SignInput = {
  readonly privateKey: `0x${string}`;
  readonly resourceUrl: string;
  readonly quote: OutboundX402QuoteTerms;
};

export type Eip3009SignOutput = {
  readonly paymentHeader: string;
  readonly payerAddress: string;
};

const authorizationTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

function chainIdOf(network: string): number {
  const m = /^eip155:(\d+)$/i.exec(network.trim());
  if (!m) {
    throw new X402Error({ reason: `unsupported_network_for_eip3009:${network}` });
  }
  return Number(m[1]);
}

function tokenMeta(quote: OutboundX402QuoteTerms): { name: string; version: string } {
  const name = quote.extra?.name?.trim() || "USDC";
  const version = quote.extra?.version?.trim() || "2";
  return { name, version };
}

/**
 * Sign an x402 exact EIP-3009 payment payload. Dynamic-imports viem.
 */
export function signEip3009Payment(
  input: Eip3009SignInput
): Effect.Effect<Eip3009SignOutput, X402Error> {
  return Effect.tryPromise({
    try: async () => {
      let viem: typeof import("viem");
      let accounts: typeof import("viem/accounts");
      try {
        viem = await import("viem");
        accounts = await import("viem/accounts");
      } catch (cause) {
        throw new X402Error({
          reason: "viem_required_for_eip3009_signing — install optionalDependency viem",
          cause,
        });
      }

      const account = accounts.privateKeyToAccount(input.privateKey);
      const { name, version } = tokenMeta(input.quote);
      const chainId = chainIdOf(input.quote.network);
      const now = Math.floor(Date.now() / 1000);
      const maxTimeout = input.quote.maxTimeoutSeconds ?? 300;
      const nonce = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;

      const authorization = {
        from: viem.getAddress(account.address),
        to: viem.getAddress(input.quote.payTo as `0x${string}`),
        value: input.quote.amountAtomic,
        validAfter: String(now - 600),
        validBefore: String(now + maxTimeout),
        nonce,
      };

      const signature = await account.signTypedData({
        domain: {
          name,
          version,
          chainId,
          verifyingContract: viem.getAddress(input.quote.asset as `0x${string}`),
        },
        types: authorizationTypes,
        primaryType: "TransferWithAuthorization",
        message: {
          from: authorization.from,
          to: authorization.to,
          value: BigInt(authorization.value),
          validAfter: BigInt(authorization.validAfter),
          validBefore: BigInt(authorization.validBefore),
          nonce: authorization.nonce,
        },
      });

      const paymentPayload = {
        x402Version: 2,
        resource: { url: input.resourceUrl },
        accepted: {
          scheme: input.quote.scheme,
          network: input.quote.network,
          amount: input.quote.amountAtomic,
          asset: input.quote.asset,
          payTo: input.quote.payTo,
          maxTimeoutSeconds: maxTimeout,
          extra: { name, version, ...(input.quote.extra ?? {}) },
        },
        payload: {
          authorization,
          signature,
        },
      };

      return {
        paymentHeader: Buffer.from(JSON.stringify(paymentPayload)).toString("base64"),
        payerAddress: account.address,
      };
    },
    catch: (cause) =>
      cause instanceof X402Error
        ? cause
        : new X402Error({ reason: "eip3009_sign_failed", cause }),
  });
}

export function parseSignerSecret(raw: string): {
  address?: string;
  privateKey?: `0x${string}`;
} {
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed) as {
      address?: string;
      privateKey?: string;
      pk?: string;
    };
    const pk = (parsed.privateKey ?? parsed.pk)?.trim();
    return {
      address: parsed.address?.trim(),
      privateKey: pk
        ? ((pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`)
        : undefined,
    };
  } catch {
    // Raw hex private key
    if (/^(0x)?[0-9a-fA-F]{64}$/.test(trimmed)) {
      return {
        privateKey: (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as `0x${string}`,
      };
    }
    return {};
  }
}
