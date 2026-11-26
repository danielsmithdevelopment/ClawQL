import { Context, Effect, Result, Layer } from "effect";
import { PaymentsConfigService } from "../config/payments-config-service.js";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import { ConfigError, PaymentError, X402Error } from "../errors/payment-errors.js";
import { buildX402PaymentFailedEntry, buildX402PaymentReceivedEntry } from "../audit/events.js";
import { Ap2MandateService } from "../ap2/ap2-mandate-service.js";
import { isAp2Enabled, isAp2Required } from "../ap2/config.js";
import { isMppEnabled } from "../mpp/config.js";
import { extractPaymentCredential } from "../mpp/credential.js";
import { buildChallengesFromOffers } from "../mpp/challenge.js";
import { offersFromX402Required } from "../mpp/offers.js";
import { MppVerificationError } from "../mpp/verification-errors.js";
import { MppVerificationService } from "../mpp/verification-service.js";
import type { MppPaymentChallenge } from "../mpp/types.js";
import { parseX402PaymentPayloadHeader, readX402PaymentHeader } from "./headers.js";
import { buildPaymentRequired, buildPaymentRequirements } from "./payment-requirements.js";
import {
  hashX402PaymentPayload,
  sharedX402ReplayCache,
  type X402ReplayCache,
} from "./replay-cache.js";
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
  /**
   * Audit 6.01: settle defaults to true. Set false only for isolated unit tests
   * that mock verify without a settle endpoint. `CLAWQL_TIER=regulated` refuses
   * `settle: false` (settle-before-allow; facilitator is the cross-replica guarantee).
   */
  settle?: boolean;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  replayCache?: X402ReplayCache;
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
export class X402EnforcementService extends Context.Service<
  X402EnforcementService,
  {
    readonly enforceGate: (
      input: EnforceX402GateInput
    ) => Effect.Effect<X402EnforceResult, ConfigError | X402Error | PaymentError>;
    readonly reconcileSettlement: (input: {
      tenantId: string;
      resource: string;
      amountUsdc: number;
      proof: X402PaymentProof;
      correlationId?: string;
    }) => Effect.Effect<X402Settlement, PaymentError>;
  }
>()("clawql/X402EnforcementService") {}

export function x402EnforcementLiveLayer(): Layer.Layer<
  X402EnforcementService,
  never,
  | PaymentsConfigService
  | PaymentAuditService
  | X402GateService
  | X402RuntimeConfigService
  | X402FacilitatorService
  | MppVerificationService
  | Ap2MandateService
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
      const ap2 = yield* Ap2MandateService;

      const wormRequired = (runEnv: NodeJS.ProcessEnv) => {
        if (runEnv.CLAWQL_TIER?.trim().toLowerCase() === "regulated") return true;
        const raw = runEnv.CLAWQL_WORM_REQUIRED?.trim().toLowerCase();
        return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
      };

      const gatedAuditAppend = <A, E>(
        write: Effect.Effect<A, E>,
        runEnv: NodeJS.ProcessEnv
      ): Effect.Effect<A | void, E> => {
        // Audit 6.05: gated WORM — refuse when required; best-effort otherwise.
        if (wormRequired(runEnv)) return write.pipe(Effect.asVoid);
        return write.pipe(
          Effect.asVoid,
          Effect.catch(() => Effect.void)
        );
      };

      const recordPaymentFailed = (input: {
        tenantId: string;
        resource: string;
        reason: string;
        correlationId?: string;
        env?: NodeJS.ProcessEnv;
      }) =>
        gatedAuditAppend(
          audit.appendEntry(
            buildX402PaymentFailedEntry({
              tenantId: input.tenantId,
              resource: input.resource,
              reason: input.reason,
              correlationId: input.correlationId,
            })
          ),
          input.env ?? process.env
        );

      const reconcileSettlement = (input: {
        tenantId: string;
        resource: string;
        amountUsdc: number;
        proof: X402PaymentProof;
        correlationId?: string;
        env?: NodeJS.ProcessEnv;
      }) =>
        Effect.gen(function* () {
          if (!input.proof.txHash?.trim()) {
            // Audit 6.01: never record PAYMENT_RECEIVED without a settlement tx.
            return {
              id: `x402_unsettle_${Date.now().toString(36)}`,
              amountUsdc: input.amountUsdc,
              resource: input.resource,
              tenantId: input.tenantId,
              settledAt: new Date().toISOString(),
            } satisfies X402Settlement;
          }
          const settlement: X402Settlement = {
            id: `x402_${Date.now().toString(36)}`,
            txHash: input.proof.txHash,
            amountUsdc: input.amountUsdc,
            resource: input.resource,
            tenantId: input.tenantId,
            settledAt: new Date().toISOString(),
          };
          yield* gatedAuditAppend(
            audit.appendEntry(
              buildX402PaymentReceivedEntry({
                tenantId: input.tenantId,
                amountUsdc: input.amountUsdc,
                resource: input.resource,
                agentId: input.proof.payer,
                correlationId: input.correlationId,
                txHash: input.proof.txHash,
              })
            ),
            input.env ?? process.env
          );
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

          let ap2MandateId: string | undefined;
          if (isAp2Enabled(env) || isAp2Required(env)) {
            const ap2Check = yield* ap2.verifyFromHeaders({
              headers: input.headers,
              resource: gate.resource,
              amountMajor: gate.price,
              currency: gate.asset === "USDC" ? "USD" : "USD",
              env,
              correlationId: input.correlationId,
              tenantId,
            });
            if (isAp2Required(env) && (!ap2Check.present || !ap2Check.ok)) {
              const reason =
                ap2Check.present && !ap2Check.ok
                  ? ap2Check.reason
                  : "AP2 Payment Mandate required (CLAWQL_AP2_REQUIRE=1)";
              yield* recordPaymentFailed({
                tenantId,
                resource: gate.resource,
                reason,
                correlationId: input.correlationId,
                env,
              });
              return {
                action: "deny" as const,
                status: 402 as const,
                reason,
                resource: gate.resource,
              };
            }
            if (ap2Check.present && ap2Check.ok) {
              ap2MandateId =
                ap2Check.mandate.payment_mandate_id ??
                ap2Check.mandate.transaction_id ??
                "verified";
              const allowWithoutX402 =
                env.CLAWQL_AP2_ALLOW_WITHOUT_X402?.trim().toLowerCase() === "1" ||
                env.CLAWQL_AP2_ALLOW_WITHOUT_X402?.trim().toLowerCase() === "true";
              if (allowWithoutX402 && !credential && !paymentHeader) {
                return {
                  action: "allow" as const,
                  resource: gate.resource,
                  payer: ap2MandateId,
                };
              }
            }
          }
          void ap2MandateId;

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
              const offers = offersFromX402Required(body, stripeEnabled, env);
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
              .pipe(Effect.result);

            if (Result.isFailure(verification)) {
              const err = verification.failure;
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
                env,
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
              payer: verification.success.payer,
              resource: gate.resource,
              mppReceipt: verification.success.receipt,
              mppReceiptHeader: verification.success.receiptHeader,
            };
          }

          if (!paymentHeader) {
            const reason = "payment credential header is required";
            yield* recordPaymentFailed({
              tenantId,
              resource: gate.resource,
              reason,
              correlationId: input.correlationId,
              env,
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
              env,
            });
            return {
              action: "deny" as const,
              status: 402 as const,
              reason,
              resource: gate.resource,
            };
          }

          const replay = input.replayCache ?? sharedX402ReplayCache();
          const payloadKey = hashX402PaymentPayload(paymentPayload);
          if (replay.seen(payloadKey)) {
            const reason = "x402 payment payload already settled (replay refused)";
            yield* recordPaymentFailed({
              tenantId,
              resource: gate.resource,
              reason,
              correlationId: input.correlationId,
              env,
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
              env,
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
              env,
            });
            return {
              action: "deny" as const,
              status: 402 as const,
              reason: verified.reason,
              resource: gate.resource,
            };
          }

          // Audit 6.01: settle before allow (default on).
          // Regulated refuses settle:false — replay safety rests on the facilitator
          // refusing a second settle; verify-only must not mint an allow+remember.
          if (
            input.settle === false &&
            env.CLAWQL_TIER?.trim().toLowerCase() === "regulated"
          ) {
            const reason =
              "CLAWQL_TIER=regulated refuses x402 settle:false (settle-before-allow required)";
            yield* recordPaymentFailed({
              tenantId,
              resource: gate.resource,
              reason,
              correlationId: input.correlationId,
              env,
            });
            return {
              action: "deny" as const,
              status: 402 as const,
              reason,
              resource: gate.resource,
            };
          }
          const shouldSettle = input.settle !== false;
          let txHash: string | undefined;
          if (shouldSettle) {
            const settled = yield* facilitator.settle({
              facilitatorUrl: config.facilitatorUrl,
              paymentPayload,
              paymentRequirements,
              env,
              fetchImpl: input.fetchImpl,
            });
            if (!settled.settled) {
              yield* recordPaymentFailed({
                tenantId,
                resource: gate.resource,
                reason: settled.reason,
                correlationId: input.correlationId,
                env,
              });
              return {
                action: "deny" as const,
                status: 402 as const,
                reason: settled.reason,
                resource: gate.resource,
              };
            }
            txHash = settled.transaction;
          }

          replay.remember(payloadKey);

          yield* reconcileSettlement({
            tenantId,
            resource: gate.resource,
            amountUsdc: gate.price,
            proof: {
              payer: verified.payer,
              amount: gate.price,
              asset: gate.asset,
              resource: gate.resource,
              txHash,
            },
            correlationId: input.correlationId,
            env,
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
