/**
 * Consumer USDC → fiat off-ramp sessions (Moonpay / Transak widget URLs).
 *
 * Distinct from Ramp Business agent cards and Stripe Connect bank payouts.
 */

import { Context, Effect, Layer } from "effect";
import { Data } from "effect";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import { buildOfframpSessionCreatedEntry } from "../audit/events.js";
import {
  defaultOffRampProvider,
  isOffRampDryRun,
  isOffRampEnabled,
  moonpayApiKey,
  moonpaySellBaseUrl,
  transakApiKey,
  transakBaseUrl,
  type OffRampProvider,
} from "./config.js";

export class OffRampError extends Data.TaggedError("OffRampError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type OffRampSessionResult = {
  id: string;
  provider: OffRampProvider;
  url: string;
  amountUsd: number;
  walletAddress: string;
  dryRun: boolean;
};

/** Effect service for consumer crypto→fiat off-ramp widget sessions. */
export class ConsumerOffRampService extends Context.Tag("clawql/ConsumerOffRampService")<
  ConsumerOffRampService,
  {
    readonly createSession: (input: {
      amountUsd: number;
      walletAddress: string;
      provider?: OffRampProvider;
      email?: string;
      redirectUrl?: string;
      tenantId?: string;
      creatorId?: string;
      correlationId?: string;
    }) => Effect.Effect<OffRampSessionResult, OffRampError>;
  }
>() {}

function buildMoonpaySellUrl(input: {
  apiKey: string;
  amountUsd: number;
  walletAddress: string;
  email?: string;
  redirectUrl?: string;
  baseUrl: string;
}): string {
  const u = new URL(input.baseUrl);
  u.searchParams.set("apiKey", input.apiKey);
  u.searchParams.set("baseCurrencyCode", "usdc");
  u.searchParams.set("baseCurrencyAmount", String(input.amountUsd));
  u.searchParams.set("refundWalletAddress", input.walletAddress);
  if (input.email) u.searchParams.set("email", input.email);
  if (input.redirectUrl) u.searchParams.set("redirectURL", input.redirectUrl);
  return u.toString();
}

function buildTransakSellUrl(input: {
  apiKey: string;
  amountUsd: number;
  walletAddress: string;
  email?: string;
  redirectUrl?: string;
  baseUrl: string;
}): string {
  const u = new URL(input.baseUrl);
  u.searchParams.set("apiKey", input.apiKey);
  u.searchParams.set("cryptoCurrencyCode", "USDC");
  u.searchParams.set("network", "base");
  u.searchParams.set("walletAddress", input.walletAddress);
  u.searchParams.set("cryptoAmount", String(input.amountUsd));
  u.searchParams.set("productsAvailed", "SELL");
  if (input.email) u.searchParams.set("email", input.email);
  if (input.redirectUrl) u.searchParams.set("redirectURL", input.redirectUrl);
  return u.toString();
}

export function consumerOffRampLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<ConsumerOffRampService, never, PaymentAuditService> {
  return Layer.effect(
    ConsumerOffRampService,
    Effect.gen(function* () {
      const audit = yield* PaymentAuditService;

      const createSession = (input: {
        amountUsd: number;
        walletAddress: string;
        provider?: OffRampProvider;
        email?: string;
        redirectUrl?: string;
        tenantId?: string;
        creatorId?: string;
        correlationId?: string;
      }) =>
        Effect.gen(function* () {
          if (!isOffRampEnabled(env)) {
            return yield* Effect.fail(
              new OffRampError({
                reason: "Off-ramp disabled — set CLAWQL_OFFRAMP_ENABLED=1 and a provider API key",
              })
            );
          }
          if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
            return yield* Effect.fail(new OffRampError({ reason: "amountUsd must be > 0" }));
          }
          const wallet = input.walletAddress.trim();
          if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
            return yield* Effect.fail(new OffRampError({ reason: "walletAddress must be 0x…" }));
          }
          const provider = input.provider ?? defaultOffRampProvider(env);
          const tenantId = input.tenantId?.trim() || "default";
          const id = `offramp_${provider}_${Date.now().toString(36)}`;

          let url: string;
          if (isOffRampDryRun(env)) {
            url = `https://clawql.local/offramp/dry/${provider}?amount=${input.amountUsd}&wallet=${wallet}`;
          } else if (provider === "moonpay") {
            const key = moonpayApiKey(env);
            if (!key) {
              return yield* Effect.fail(
                new OffRampError({ reason: "MOONPAY_API_KEY required for Moonpay sessions" })
              );
            }
            url = buildMoonpaySellUrl({
              apiKey: key,
              amountUsd: input.amountUsd,
              walletAddress: wallet,
              email: input.email,
              redirectUrl: input.redirectUrl,
              baseUrl: moonpaySellBaseUrl(env),
            });
          } else {
            const key = transakApiKey(env);
            if (!key) {
              return yield* Effect.fail(
                new OffRampError({ reason: "TRANSAK_API_KEY required for Transak sessions" })
              );
            }
            url = buildTransakSellUrl({
              apiKey: key,
              amountUsd: input.amountUsd,
              walletAddress: wallet,
              email: input.email,
              redirectUrl: input.redirectUrl,
              baseUrl: transakBaseUrl(env),
            });
          }

          yield* audit
            .appendEntry(
              buildOfframpSessionCreatedEntry({
                tenantId,
                sessionId: id,
                provider,
                amountUsd: input.amountUsd,
                walletAddress: wallet,
                dryRun: isOffRampDryRun(env),
                correlationId: input.correlationId,
                creatorId: input.creatorId,
              })
            )
            .pipe(Effect.catchAll(() => Effect.void));

          return {
            id,
            provider,
            url,
            amountUsd: input.amountUsd,
            walletAddress: wallet,
            dryRun: isOffRampDryRun(env),
          } satisfies OffRampSessionResult;
        });

      return ConsumerOffRampService.of({ createSession });
    })
  );
}
