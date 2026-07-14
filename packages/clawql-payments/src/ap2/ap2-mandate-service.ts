import { Context, Effect, Layer } from "effect";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import { buildAp2MandateFailedEntry, buildAp2MandateVerifiedEntry } from "../audit/events.js";
import { ap2HmacSecret, ap2Issuer, isAp2Enabled } from "./config.js";
import { Ap2Error } from "./jwt.js";
import {
  assertMandateNotExpired,
  mandateCoversAmount,
  parsePaymentMandate,
  readAp2MandateHeader,
} from "./parse.js";
import type { Ap2AuthorizeInput, Ap2PaymentMandate, Ap2VerifyResult } from "./types.js";

export type VerifyAp2MandateInput = {
  raw: string | Record<string, unknown>;
  requireSignature?: boolean;
  env?: NodeJS.ProcessEnv;
  correlationId?: string;
  tenantId?: string;
  resource?: string;
};

/** Effect service for AP2 Payment Mandate parse/verify/authorize. */
export class Ap2MandateService extends Context.Tag("clawql/Ap2MandateService")<
  Ap2MandateService,
  {
    readonly verifyPaymentMandate: (
      input: VerifyAp2MandateInput
    ) => Effect.Effect<Ap2VerifyResult, Ap2Error>;
    readonly authorizeForResource: (
      input: Ap2AuthorizeInput
    ) => Effect.Effect<{ ok: true; mandate: Ap2PaymentMandate }, Ap2Error>;
    readonly verifyFromHeaders: (input: {
      headers: Record<string, string | string[] | undefined>;
      resource: string;
      amountMajor?: number;
      currency?: string;
      env?: NodeJS.ProcessEnv;
      correlationId?: string;
      tenantId?: string;
    }) => Effect.Effect<
      | { present: false }
      | { present: true; ok: true; mandate: Ap2PaymentMandate; signed: boolean }
      | { present: true; ok: false; reason: string },
      never
    >;
  }
>() {}

export function ap2MandateLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<Ap2MandateService, never, PaymentAuditService> {
  return Layer.effect(
    Ap2MandateService,
    Effect.gen(function* () {
      const audit = yield* PaymentAuditService;

      const verifyPaymentMandate = (input: VerifyAp2MandateInput) =>
        Effect.try({
          try: () => {
            const runEnv = input.env ?? env;
            if (!isAp2Enabled(runEnv) && input.requireSignature !== true) {
              // Still allow explicit verify CLI/tests when disabled — structure only.
            }
            const secret = ap2HmacSecret(runEnv);
            const requireSignature =
              input.requireSignature === true ||
              Boolean(secret && runEnv.CLAWQL_AP2_REQUIRE_SIG === "1");
            const { mandate, signed } = parsePaymentMandate(input.raw, {
              hmacSecret: secret,
              requireSignature,
            });
            const issuer = ap2Issuer(runEnv);
            if (issuer && typeof mandate.raw.iss === "string" && mandate.raw.iss !== issuer) {
              throw new Ap2Error({
                reason: `AP2 issuer mismatch: expected ${issuer}, got ${mandate.raw.iss}`,
              });
            }
            assertMandateNotExpired(mandate);
            return {
              ok: true as const,
              mandate,
              signed,
              transactionId: mandate.transaction_id ?? mandate.payment_mandate_id,
            };
          },
          catch: (cause) =>
            cause instanceof Ap2Error
              ? cause
              : new Ap2Error({
                  reason: cause instanceof Error ? cause.message : String(cause),
                  cause,
                }),
        }).pipe(
          Effect.tap((result) =>
            audit
              .appendEntry(
                buildAp2MandateVerifiedEntry({
                  tenantId: input.tenantId ?? "default",
                  resource: input.resource ?? "ap2.verify",
                  mandateId: result.transactionId,
                  signed: result.signed,
                  correlationId: input.correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void))
          ),
          Effect.tapError((err) =>
            audit
              .appendEntry(
                buildAp2MandateFailedEntry({
                  tenantId: input.tenantId ?? "default",
                  resource: input.resource ?? "ap2.verify",
                  reason: err.reason,
                  correlationId: input.correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void))
          )
        );

      const authorizeForResource = (input: Ap2AuthorizeInput) =>
        Effect.gen(function* () {
          yield* Effect.try({
            try: () => assertMandateNotExpired(input.mandate),
            catch: (cause) =>
              cause instanceof Ap2Error
                ? cause
                : new Ap2Error({
                    reason: cause instanceof Error ? cause.message : String(cause),
                    cause,
                  }),
          });
          if (input.merchantId?.trim()) {
            const payeeId =
              input.mandate.payee?.id ??
              input.mandate.merchant_agent ??
              (typeof input.mandate.payee?.name === "string"
                ? input.mandate.payee.name
                : undefined);
            if (payeeId && payeeId !== input.merchantId.trim()) {
              return yield* Effect.fail(
                new Ap2Error({
                  reason: `AP2 payee mismatch: mandate=${payeeId} resource=${input.merchantId}`,
                })
              );
            }
          }
          if (
            input.amountMajor !== undefined &&
            !mandateCoversAmount(input.mandate, input.amountMajor, input.currency ?? "USD")
          ) {
            return yield* Effect.fail(
              new Ap2Error({
                reason: `AP2 mandate amount insufficient for ${input.amountMajor} ${input.currency ?? "USD"}`,
              })
            );
          }
          return { ok: true as const, mandate: input.mandate };
        });

      const verifyFromHeaders = (input: {
        headers: Record<string, string | string[] | undefined>;
        resource: string;
        amountMajor?: number;
        currency?: string;
        env?: NodeJS.ProcessEnv;
        correlationId?: string;
        tenantId?: string;
      }) =>
        Effect.gen(function* () {
          const raw = readAp2MandateHeader(input.headers);
          if (!raw) return { present: false as const };
          const verified = yield* verifyPaymentMandate({
            raw,
            env: input.env,
            correlationId: input.correlationId,
            tenantId: input.tenantId,
            resource: input.resource,
          }).pipe(Effect.either);
          if (verified._tag === "Left") {
            return {
              present: true as const,
              ok: false as const,
              reason: verified.left.reason,
            };
          }
          const auth = yield* authorizeForResource({
            mandate: verified.right.mandate,
            resource: input.resource,
            amountMajor: input.amountMajor,
            currency: input.currency,
          }).pipe(Effect.either);
          if (auth._tag === "Left") {
            return { present: true as const, ok: false as const, reason: auth.left.reason };
          }
          return {
            present: true as const,
            ok: true as const,
            mandate: verified.right.mandate,
            signed: verified.right.signed,
          };
        });

      return Ap2MandateService.of({
        verifyPaymentMandate,
        authorizeForResource,
        verifyFromHeaders,
      });
    })
  );
}
