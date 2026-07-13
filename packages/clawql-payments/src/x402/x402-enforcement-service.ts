import { Context, Effect, Either, Layer } from "effect";
import { PaymentsConfigService } from "../config/payments-config-service.js";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import { ConfigError, X402Error } from "../errors/payment-errors.js";
import { buildX402PaymentFailedEntry, buildX402PaymentReceivedEntry } from "../audit/events.js";
import { isMppEnabled } from "../mpp/config.js";
import { extractPaymentCredential } from "../mpp/credential.js";
import { buildChallengesFromOffers } from "../mpp/challenge.js";
import { offersFromX402Required } from "../mpp/offers.js";
import { MppVerificationError } from "../mpp/verification-errors.js";
import { MppVerificationService } from "../mpp/verification-service.js";
import type { MppPaymentChallenge } from "../mpp/types.js";
import { parseX402PaymentPayloadHeader, readX402PaymentHeader } from "./headers.js";
import { buildPaymentRequired, buildPaymentRequirements } from "./payment-requirements.js";
import type { X402PaymentRequired } from "./types.js";
import { X402FacilitatorService } from "./x402-facilitator-service.js";
import { X402GateService } from "./x402-gate-service.js";
import { X402RuntimeConfigService } from "./x402-runtime-config-service.js";
import type { X402PaymentProof } from "./verify.js";

export type X402EnforceResult =
  | {
      action: "allow";
      payer?: string;
      resource: string;
      mppReceipt?: Record<string, unknown>;
      mppReceiptHeader?: string;
    }
  | {
      action: "require_payment";
      status: 402;
      body: X402PaymentRequired;
      resource: string;
      mppChallenges?: MppPaymentChallenge[];
    }
  | {
      action: "deny";
      status: 402;
      reason: string;
      resource: string;
      mppVerificationCode?: number;
    };

export type EnforceX402GateInput = {
  resource: string;
  requestUrl: string;
  headers: Record<string, string | string[] | undefined>;
  correlationId?: string;
  settle?: boolean;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
};

export type X402Settlement = {
  id: string;
  txHash?: string;
  amountUsdc: number;
  resource: string;
  tenantId: string;
  settledAt: string;
};

/** Effect service for x402 gate enforcement and settlement reconciliation. */
export class X402EnforcementService extends Context.Tag("clawql/X402EnforcementService")<
  X402EnforcementService,
  {
    readonly enforceGate: (
      input: EnforceX402GateInput
    ) => Effect.Effect<X402EnforceResult, ConfigError | X402Error>;
    readonly reconcileSettlement: (input: {
      tenantId: string;
      resource: string;
      amountUsdc: number;
      proof: X402PaymentProof;
      correlationId?: string;
    }) => Effect.Effect<X402Settlement, never>;
  }
>() {}

export function x402EnforcementLiveLayer(): Layer.Layer<
  X402EnforcementService,
  never,
  | PaymentsConfigService
  | PaymentAuditService
  | X402GateService
  | X402RuntimeConfigService
  | X402FacilitatorService
  | MppVerificationService
> {
  return Layer.effect(
    X402EnforcementService,
    Effect.gen(function* () {
      const configService = yield* PaymentsConfigService;
      const audit = yield* PaymentAuditService;
      const gates = yield* X402GateService;
      const runtimeConfig = yield* X402RuntimeConfigService;
      const facilitator = yield* X402FacilitatorService;
      const mppVerification = yield* MppVerificationService;

      const recordPaymentFailed = (input: {
        tenantId: string;
        resource: string;
        reason: string;
        correlationId?: string;
      }) =>
        audit
          .appendEntry(
            buildX402PaymentFailedEntry({
              tenantId: input.tenantId,
              resource: input.resource,
              reason: input.reason,
              correlationId: input.correlationId,
            })
          )
          .pipe(
            Effect.asVoid,
            Effect.catchAll(() => Effect.void)
          );

      const reconcileSettlement = (input: {
        tenantId: string;
        resource: string;
        amountUsdc: number;
        proof: X402PaymentProof;
        correlationId?: string;
      }) =>
        Effect.gen(function* () {
          const settlement: X402Settlement = {
            id: `x402_${Date.now().toString(36)}`,
            txHash: input.proof.txHash,
            amountUsdc: input.amountUsdc,
            resource: input.resource,
            tenantId: input.tenantId,
            settledAt: new Date().toISOString(),
          };
          yield* audit
            .appendEntry(
              buildX402PaymentReceivedEntry({
                tenantId: input.tenantId,
                amountUsdc: input.amountUsdc,
                resource: input.resource,
                agentId: input.proof.payer,
                correlationId: input.correlationId,
              })
            )
            .pipe(Effect.catchAll(() => Effect.void));
          return settlement;
        });

      const enforceGate = (input: EnforceX402GateInput) =>
        Effect.gen(function* () {
          const env = input.env ?? process.env;
          const gate = yield* gates.findForResource(input.resource);
          if (!gate) {
            return { action: "allow" as const, resource: input.resource };
          }

          const paymentsConfig = yield* configService.load();
          const tenantId = paymentsConfig.tenantId ?? "default";
          const mppOn = isMppEnabled(env);
          const credential = extractPaymentCredential(input.headers);
          const paymentHeader = readX402PaymentHeader(input.headers);

          if (!credential && !paymentHeader) {
            const config = yield* runtimeConfig.load();
            const body = buildPaymentRequired({
              gate,
              config,
              resource: {
                url: input.requestUrl,
                description: `Payment required for ${gate.resource}`,
                mimeType: "application/json",
              },
            });

            let mppChallenges: MppPaymentChallenge[] | undefined;
            if (mppOn) {
              const stripeEnabled = Boolean(env.STRIPE_SECRET_KEY?.trim());
              const offers = offersFromX402Required(body, stripeEnabled);
              mppChallenges = buildChallengesFromOffers({
                offers,
                resource: gate.resource,
                x402Body: body,
              });
              yield* mppVerification.registerChallenges(mppChallenges);
            }

            return {
              action: "require_payment" as const,
              status: 402 as const,
              body,
              resource: gate.resource,
              mppChallenges,
            };
          }

          if (mppOn && credential) {
            const verification = yield* mppVerification
              .verifyCredential({
                resource: input.resource,
                requestUrl: input.requestUrl,
                gate,
                headers: input.headers,
                correlationId: input.correlationId,
                env,
                fetchImpl: input.fetchImpl,
              })
              .pipe(Effect.either);

            if (Either.isLeft(verification)) {
              const err = verification.left;
              const reason =
                err instanceof MppVerificationError
                  ? err.reason
                  : "reason" in err && typeof err.reason === "string"
                    ? err.reason
                    : "MPP credential verification failed";
              yield* recordPaymentFailed({
                tenantId,
                resource: gate.resource,
                reason,
                correlationId: input.correlationId,
              });
              return {
                action: "deny" as const,
                status: 402 as const,
                reason,
                resource: gate.resource,
                mppVerificationCode: err instanceof MppVerificationError ? err.code : undefined,
              };
            }

            return {
              action: "allow" as const,
              payer: verification.right.payer,
              resource: gate.resource,
              mppReceipt: verification.right.receipt,
              mppReceiptHeader: verification.right.receiptHeader,
            };
          }

          if (!paymentHeader) {
            const reason = "payment credential header is required";
            yield* recordPaymentFailed({
              tenantId,
              resource: gate.resource,
              reason,
              correlationId: input.correlationId,
            });
            return {
              action: "deny" as const,
              status: 402 as const,
              reason,
              resource: gate.resource,
            };
          }

          const paymentPayload = parseX402PaymentPayloadHeader(paymentHeader);
          if (!paymentPayload) {
            const reason = "invalid x402 payment payload in PAYMENT-SIGNATURE header";
            yield* recordPaymentFailed({
              tenantId,
              resource: gate.resource,
              reason,
              correlationId: input.correlationId,
            });
            return {
              action: "deny" as const,
              status: 402 as const,
              reason,
              resource: gate.resource,
            };
          }

          const config = yield* runtimeConfig.load();
          if (!config.facilitatorUrl) {
            const reason = "x402 facilitator URL is not configured";
            yield* recordPaymentFailed({
              tenantId,
              resource: gate.resource,
              reason,
              correlationId: input.correlationId,
            });
            return {
              action: "deny" as const,
              status: 402 as const,
              reason,
              resource: gate.resource,
            };
          }

          const paymentRequirements = buildPaymentRequirements({
            gate,
            config,
            resourceUrl: input.requestUrl,
          });

          const verified = yield* facilitator.verify({
            facilitatorUrl: config.facilitatorUrl,
            paymentPayload,
            paymentRequirements,
            env,
            fetchImpl: input.fetchImpl,
          });

          if (!verified.verified) {
            yield* recordPaymentFailed({
              tenantId,
              resource: gate.resource,
              reason: verified.reason,
              correlationId: input.correlationId,
            });
            return {
              action: "deny" as const,
              status: 402 as const,
              reason: verified.reason,
              resource: gate.resource,
            };
          }

          yield* reconcileSettlement({
            tenantId,
            resource: gate.resource,
            amountUsdc: gate.price,
            proof: {
              payer: verified.payer,
              amount: gate.price,
              asset: gate.asset,
              resource: gate.resource,
            },
            correlationId: input.correlationId,
          });

          return {
            action: "allow" as const,
            payer: verified.payer,
            resource: gate.resource,
          };
        });

      return X402EnforcementService.of({
        enforceGate,
        reconcileSettlement,
      });
    })
  );
}
