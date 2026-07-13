import { Context, Effect, Layer } from "effect";
import { PaymentsConfigService } from "../config/payments-config-service.js";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import { buildX402PaymentReceivedEntry } from "../audit/events.js";
import { stripeTryPromise } from "../stripe/stripe-client-service.js";
import { StripeClientService } from "../stripe/stripe-client-service.js";
import { StripeApiError, StripeNotConfigured } from "../stripe/stripe-errors.js";
import { ConfigError, X402Error } from "../errors/payment-errors.js";
import type { X402Gate } from "../x402/gate.js";
import { X402FacilitatorService } from "../x402/x402-facilitator-service.js";
import { usdcAtomicAmount, X402RuntimeConfigService } from "../x402/x402-runtime-config-service.js";
import { isMppEnabled } from "./config.js";
import {
  decodeChallengeRequest,
  extractPaymentCredential,
  x402PayloadFromMppCredential,
  type ParsedPaymentCredential,
} from "./credential.js";
import { buildMppPaymentReceipt, mppPaymentReceiptHeader } from "./receipt.js";
import { MppVerificationError } from "./verification-errors.js";
import {
  MPP_METHOD_STRIPE,
  MPP_METHOD_X402,
  MPP_MCP_VERIFICATION_FAILED_CODE,
  type MppPaymentChallenge,
  type MppPaymentMethod,
} from "./types.js";

export type MppVerificationSuccess = {
  method: MppPaymentMethod;
  payer?: string;
  receipt: Record<string, unknown>;
  receiptHeader: string;
  settlementId?: string;
};

export type VerifyMppCredentialInput = {
  resource: string;
  requestUrl: string;
  gate: X402Gate;
  headers: Record<string, string | string[] | undefined>;
  correlationId?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
};

type StoredChallenge = {
  challenge: MppPaymentChallenge;
  expiresAt?: number;
};

function parseExpiresMs(expires: string | undefined): number | undefined {
  if (!expires?.trim()) return undefined;
  const ms = Date.parse(expires);
  return Number.isFinite(ms) ? ms : undefined;
}

function extractStripeSpt(payload: Record<string, unknown>): string | undefined {
  const direct = [payload.shared_payment_token, payload.spt, payload.token];
  for (const value of direct) {
    if (typeof value === "string" && value.trim().startsWith("spt_")) {
      return value.trim();
    }
  }
  if (payload.type === "shared_payment_token" && typeof payload.token === "string") {
    return payload.token.trim();
  }
  return undefined;
}

function amountMinorUnits(amount: unknown, currency: string): number | undefined {
  if (typeof amount === "number" && Number.isFinite(amount)) {
    return Math.round(amount);
  }
  if (typeof amount === "string" && amount.trim()) {
    const parsed = Number.parseInt(amount, 10);
    if (Number.isFinite(parsed)) return parsed;
    const asFloat = Number.parseFloat(amount);
    if (Number.isFinite(asFloat)) {
      const decimals = currency.toLowerCase() === "usd" ? 2 : 6;
      return Math.round(asFloat * 10 ** decimals);
    }
  }
  return undefined;
}

/** Effect service for MPP credential verification (x402 + Stripe SPT). */
export class MppVerificationService extends Context.Tag("clawql/MppVerificationService")<
  MppVerificationService,
  {
    readonly registerChallenges: (challenges: MppPaymentChallenge[]) => Effect.Effect<void, never>;
    readonly verifyCredential: (
      input: VerifyMppCredentialInput
    ) => Effect.Effect<
      MppVerificationSuccess,
      MppVerificationError | ConfigError | X402Error | StripeNotConfigured | StripeApiError
    >;
    readonly buildReceiptHeader: (receipt: Record<string, unknown>) => string;
  }
>() {}

export function mppVerificationLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<
  MppVerificationService,
  never,
  | PaymentsConfigService
  | PaymentAuditService
  | X402RuntimeConfigService
  | X402FacilitatorService
  | StripeClientService
> {
  const challengeRegistry = new Map<string, StoredChallenge>();

  return Layer.effect(
    MppVerificationService,
    Effect.gen(function* () {
      const configService = yield* PaymentsConfigService;
      const audit = yield* PaymentAuditService;
      const runtimeConfig = yield* X402RuntimeConfigService;
      const facilitator = yield* X402FacilitatorService;
      const stripeClient = yield* StripeClientService;

      const registerChallenges = (challenges: MppPaymentChallenge[]) =>
        Effect.sync(() => {
          for (const challenge of challenges) {
            challengeRegistry.set(challenge.id, {
              challenge,
              expiresAt: parseExpiresMs(
                typeof challenge.extensions?.expires === "string"
                  ? challenge.extensions.expires
                  : undefined
              ),
            });
          }
        });

      const consumeChallenge = (id: string): boolean => {
        const stored = challengeRegistry.get(id);
        if (!stored) return false;
        challengeRegistry.delete(id);
        if (stored.expiresAt !== undefined && Date.now() > stored.expiresAt) {
          return false;
        }
        return true;
      };

      const verifyX402 = (input: {
        parsed: ParsedPaymentCredential;
        gate: X402Gate;
        requestUrl: string;
        runEnv: NodeJS.ProcessEnv;
        fetchImpl?: typeof fetch;
        tenantId: string;
        correlationId?: string;
      }) =>
        Effect.gen(function* () {
          const paymentPayload =
            input.parsed.kind === "x402-signature"
              ? input.parsed.payload
              : x402PayloadFromMppCredential(input.parsed.credential);

          if (!paymentPayload) {
            return yield* Effect.fail(
              new MppVerificationError({
                reason: "invalid x402 credential payload",
                method: MPP_METHOD_X402,
                code: MPP_MCP_VERIFICATION_FAILED_CODE,
              })
            );
          }

          const config = yield* runtimeConfig.load();
          if (!config.walletAddress?.trim()) {
            return yield* Effect.fail(
              new MppVerificationError({
                reason: "x402 wallet address is not configured",
                method: MPP_METHOD_X402,
                code: MPP_MCP_VERIFICATION_FAILED_CODE,
              })
            );
          }
          if (!config.facilitatorUrl?.trim()) {
            return yield* Effect.fail(
              new MppVerificationError({
                reason: "x402 facilitator URL is not configured",
                method: MPP_METHOD_X402,
                code: MPP_MCP_VERIFICATION_FAILED_CODE,
              })
            );
          }

          const paymentRequirements = {
            scheme: config.scheme,
            network: config.network,
            amount: usdcAtomicAmount(input.gate.price),
            asset: config.usdcAsset,
            payTo: config.walletAddress!,
            maxTimeoutSeconds: config.maxTimeoutSeconds,
            extra: {
              name: input.gate.asset,
              version: "2",
            },
          };

          const verified = yield* facilitator.verify({
            facilitatorUrl: config.facilitatorUrl,
            paymentPayload,
            paymentRequirements,
            env: input.runEnv,
            fetchImpl: input.fetchImpl,
          });

          if (!verified.verified) {
            return yield* Effect.fail(
              new MppVerificationError({
                reason: verified.reason,
                method: MPP_METHOD_X402,
                code: MPP_MCP_VERIFICATION_FAILED_CODE,
              })
            );
          }

          const settlementId = verified.settlementId;
          yield* audit
            .appendEntry(
              buildX402PaymentReceivedEntry({
                tenantId: input.tenantId,
                amountUsdc: input.gate.price,
                resource: input.gate.resource,
                agentId: verified.payer,
                correlationId: input.correlationId,
              })
            )
            .pipe(Effect.catchAll(() => Effect.void));

          const receipt = buildMppPaymentReceipt({
            method: MPP_METHOD_X402,
            resource: input.gate.resource,
            settledAt: new Date().toISOString(),
            payer: verified.payer,
            settlementId,
            x402SettlementId: settlementId,
          });

          return {
            method: MPP_METHOD_X402 as MppPaymentMethod,
            payer: verified.payer,
            receipt,
            receiptHeader: mppPaymentReceiptHeader(receipt),
            settlementId,
          } satisfies MppVerificationSuccess;
        });

      const verifyStripe = (input: {
        credential: import("./credential.js").MppCredential;
        gate: X402Gate;
        runEnv: NodeJS.ProcessEnv;
        tenantId: string;
        correlationId?: string;
      }) =>
        Effect.gen(function* () {
          const spt = extractStripeSpt(input.credential.payload);
          if (!spt) {
            return yield* Effect.fail(
              new MppVerificationError({
                reason: "missing Stripe shared payment token in credential payload",
                method: MPP_METHOD_STRIPE,
                code: MPP_MCP_VERIFICATION_FAILED_CODE,
              })
            );
          }

          const request = decodeChallengeRequest(input.credential.challenge.request);
          const currency =
            (typeof request?.currency === "string" && request.currency) ||
            input.gate.asset.toLowerCase() ||
            "usd";
          const amount =
            amountMinorUnits(request?.amount, currency) ??
            amountMinorUnits(input.gate.price, currency);

          if (amount === undefined || amount <= 0) {
            return yield* Effect.fail(
              new MppVerificationError({
                reason: "Stripe MPP challenge is missing a valid amount",
                method: MPP_METHOD_STRIPE,
                code: MPP_MCP_VERIFICATION_FAILED_CODE,
              })
            );
          }

          const stripe = yield* stripeClient.getClient();
          const profileId =
            input.runEnv.STRIPE_PROFILE_ID?.trim() ||
            input.runEnv.STRIPE_NETWORK_ID?.trim() ||
            (typeof request?.networkId === "string" ? request.networkId : undefined);

          const paymentIntent = yield* stripeTryPromise("stripe mpp spt payment", () =>
            stripe.paymentIntents.create(
              {
                amount,
                currency: currency.toLowerCase(),
                payment_method: spt,
                confirm: true,
                metadata: {
                  clawql_resource: input.gate.resource,
                  clawql_tenant: input.tenantId,
                  ...(profileId ? { stripe_profile_id: profileId } : {}),
                },
              },
              {
                apiVersion: "2026-03-04.preview",
              }
            )
          );

          if (paymentIntent.status !== "succeeded" && paymentIntent.status !== "processing") {
            return yield* Effect.fail(
              new MppVerificationError({
                reason: `Stripe payment intent status: ${paymentIntent.status}`,
                method: MPP_METHOD_STRIPE,
                code: MPP_MCP_VERIFICATION_FAILED_CODE,
              })
            );
          }

          const receipt = buildMppPaymentReceipt({
            method: MPP_METHOD_STRIPE,
            resource: input.gate.resource,
            settledAt: new Date().toISOString(),
            settlementId: paymentIntent.id,
            stripePaymentIntentId: paymentIntent.id,
          });

          return {
            method: MPP_METHOD_STRIPE as MppPaymentMethod,
            receipt,
            receiptHeader: mppPaymentReceiptHeader(receipt),
            settlementId: paymentIntent.id,
          } satisfies MppVerificationSuccess;
        });

      const verifyCredential = (input: VerifyMppCredentialInput) =>
        Effect.gen(function* () {
          const runEnv = input.env ?? env;
          if (!isMppEnabled(runEnv)) {
            return yield* Effect.fail(
              new MppVerificationError({
                reason: "MPP verification is disabled",
                code: MPP_MCP_VERIFICATION_FAILED_CODE,
              })
            );
          }

          const parsed = extractPaymentCredential(input.headers);
          if (!parsed) {
            return yield* Effect.fail(
              new MppVerificationError({
                reason: "missing MPP or x402 payment credential",
                code: MPP_MCP_VERIFICATION_FAILED_CODE,
              })
            );
          }

          if (parsed.kind === "mpp") {
            const challengeId = parsed.credential.challenge.id?.trim();
            if (challengeId && !consumeChallenge(challengeId)) {
              return yield* Effect.fail(
                new MppVerificationError({
                  reason: "unknown or expired MPP challenge id",
                  method: parsed.credential.challenge.method,
                  code: MPP_MCP_VERIFICATION_FAILED_CODE,
                })
              );
            }

            const expiresAt = parseExpiresMs(parsed.credential.challenge.expires);
            if (expiresAt !== undefined && Date.now() > expiresAt) {
              return yield* Effect.fail(
                new MppVerificationError({
                  reason: "MPP challenge expired",
                  method: parsed.credential.challenge.method,
                  code: MPP_MCP_VERIFICATION_FAILED_CODE,
                })
              );
            }
          }

          const paymentsConfig = yield* configService.load();
          const tenantId = paymentsConfig.tenantId ?? "default";

          if (
            parsed.kind === "x402-signature" ||
            (parsed.kind === "mpp" && parsed.credential.challenge.method === MPP_METHOD_X402)
          ) {
            return yield* verifyX402({
              parsed,
              gate: input.gate,
              requestUrl: input.requestUrl,
              runEnv,
              fetchImpl: input.fetchImpl,
              tenantId,
              correlationId: input.correlationId,
            });
          }

          if (parsed.kind === "mpp" && parsed.credential.challenge.method === MPP_METHOD_STRIPE) {
            return yield* verifyStripe({
              credential: parsed.credential,
              gate: input.gate,
              runEnv,
              tenantId,
              correlationId: input.correlationId,
            });
          }

          return yield* Effect.fail(
            new MppVerificationError({
              reason: `unsupported MPP payment method: ${
                parsed.kind === "mpp" ? parsed.credential.challenge.method : "x402"
              }`,
              code: MPP_MCP_VERIFICATION_FAILED_CODE,
            })
          );
        });

      return MppVerificationService.of({
        registerChallenges,
        verifyCredential,
        buildReceiptHeader: mppPaymentReceiptHeader,
      });
    })
  );
}
