/**
 * Consumer off-ramp completion webhooks (MoonPay sell + Transak ORDER_*).
 */

import { Context, Effect, Layer } from "effect";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import {
  buildOfframpCompletedEntry,
  buildOfframpFailedEntry,
  buildOfframpUpdatedEntry,
} from "../audit/events.js";
import {
  moonpayWebhookMaxSkewSec,
  moonpayWebhookSecret,
  transakWebhookSecret,
  type OffRampProvider,
} from "./config.js";
import {
  OffRampWebhookError,
  verifyMoonpaySignatureV2,
  verifyTransakWebhookJwt,
} from "./webhook-verify.js";

export type ProcessOfframpWebhookResult = {
  handled: boolean;
  provider: OffRampProvider;
  outcome: "completed" | "failed" | "updated" | "ignored";
  transactionId?: string;
  status?: string;
  eventType?: string;
};

/** Effect service for MoonPay / Transak off-ramp webhook verify + WORM settle. */
export class OfframpWebhookService extends Context.Tag("clawql/OfframpWebhookService")<
  OfframpWebhookService,
  {
    readonly processMoonpay: (input: {
      rawBody: string;
      signatureHeader: string;
      tenantId?: string;
      correlationId?: string;
      requireSignature?: boolean;
    }) => Effect.Effect<ProcessOfframpWebhookResult, OffRampWebhookError>;
    readonly processTransak: (input: {
      rawBody: string;
      tenantId?: string;
      correlationId?: string;
      requireSignature?: boolean;
    }) => Effect.Effect<ProcessOfframpWebhookResult, OffRampWebhookError>;
    readonly process: (input: {
      provider: OffRampProvider;
      rawBody: string;
      signatureHeader?: string;
      tenantId?: string;
      correlationId?: string;
      requireSignature?: boolean;
    }) => Effect.Effect<ProcessOfframpWebhookResult, OffRampWebhookError>;
  }
>() {}

function moonpayAmountUsd(data: Record<string, unknown>): number | undefined {
  const base =
    typeof data.baseCurrencyAmount === "number"
      ? data.baseCurrencyAmount
      : typeof data.baseCurrencyAmount === "string"
        ? Number(data.baseCurrencyAmount)
        : undefined;
  if (base != null && Number.isFinite(base)) return base;
  const quote =
    typeof data.quoteCurrencyAmount === "number"
      ? data.quoteCurrencyAmount
      : typeof data.quoteCurrencyAmount === "string"
        ? Number(data.quoteCurrencyAmount)
        : undefined;
  return quote != null && Number.isFinite(quote) ? quote : undefined;
}

function classifyMoonpay(
  eventType: string,
  status: string
): "completed" | "failed" | "updated" | "ignored" {
  const et = eventType.toLowerCase();
  const st = status.toLowerCase();
  if (et.includes("failed") || st === "failed" || st === "cancelled") return "failed";
  if (st === "completed" || st === "complete") return "completed";
  if (et.includes("created") || et.includes("updated")) return "updated";
  return "ignored";
}

function classifyTransak(
  eventId: string,
  status: string
): "completed" | "failed" | "updated" | "ignored" {
  const e = eventId.toUpperCase();
  const s = status.toUpperCase();
  if (e.includes("COMPLETED") || s === "COMPLETED") return "completed";
  if (
    e.includes("FAILED") ||
    e.includes("REFUNDED") ||
    ["FAILED", "EXPIRED", "CANCELLED", "REFUNDED"].includes(s)
  ) {
    return "failed";
  }
  if (e.startsWith("ORDER_") || s) return "updated";
  return "ignored";
}

export function offrampWebhookLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<OfframpWebhookService, never, PaymentAuditService> {
  return Layer.effect(
    OfframpWebhookService,
    Effect.gen(function* () {
      const audit = yield* PaymentAuditService;

      const processMoonpay = (input: {
        rawBody: string;
        signatureHeader: string;
        tenantId?: string;
        correlationId?: string;
        requireSignature?: boolean;
      }) =>
        Effect.gen(function* () {
          const secret = moonpayWebhookSecret(env);
          const requireSig = input.requireSignature !== false;
          if (requireSig) {
            if (!secret) {
              return yield* Effect.fail(
                new OffRampWebhookError({
                  reason: "MOONPAY_WEBHOOK_SECRET required (or set requireSignature:false)",
                })
              );
            }
            const verified = verifyMoonpaySignatureV2(
              input.rawBody,
              input.signatureHeader,
              secret,
              { maxSkewSec: moonpayWebhookMaxSkewSec(env) }
            );
            if (!verified.ok) {
              return yield* Effect.fail(new OffRampWebhookError({ reason: verified.reason }));
            }
          }

          let body: Record<string, unknown>;
          try {
            body = JSON.parse(input.rawBody) as Record<string, unknown>;
          } catch (cause) {
            return yield* Effect.fail(
              new OffRampWebhookError({ reason: "Invalid MoonPay JSON body", cause })
            );
          }

          const eventType = String(body.type ?? body.eventType ?? body.event ?? "");
          const data =
            body.data && typeof body.data === "object"
              ? (body.data as Record<string, unknown>)
              : body;
          const status = String(data.status ?? "");
          const transactionId =
            (typeof data.id === "string" && data.id) ||
            (typeof data.transactionId === "string" && data.transactionId) ||
            eventType ||
            "unknown";
          const amountUsd = moonpayAmountUsd(data);
          const outcome = classifyMoonpay(eventType, status);
          const tenantId = input.tenantId?.trim() || "default";
          const correlationId = input.correlationId ?? transactionId;

          if (outcome === "completed") {
            yield* audit
              .appendEntry(
                buildOfframpCompletedEntry({
                  tenantId,
                  transactionId,
                  provider: "moonpay",
                  amountUsd,
                  correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
          } else if (outcome === "failed") {
            yield* audit
              .appendEntry(
                buildOfframpFailedEntry({
                  tenantId,
                  transactionId,
                  provider: "moonpay",
                  reason: status || eventType || "failed",
                  amountUsd,
                  correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
          } else if (outcome === "updated") {
            yield* audit
              .appendEntry(
                buildOfframpUpdatedEntry({
                  tenantId,
                  transactionId,
                  provider: "moonpay",
                  status: status || eventType,
                  amountUsd,
                  correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
          }

          return {
            handled: outcome !== "ignored",
            provider: "moonpay" as const,
            outcome,
            transactionId,
            status: status || undefined,
            eventType: eventType || undefined,
          } satisfies ProcessOfframpWebhookResult;
        });

      const processTransak = (input: {
        rawBody: string;
        tenantId?: string;
        correlationId?: string;
        requireSignature?: boolean;
      }) =>
        Effect.gen(function* () {
          let body: Record<string, unknown>;
          try {
            body = JSON.parse(input.rawBody) as Record<string, unknown>;
          } catch (cause) {
            return yield* Effect.fail(
              new OffRampWebhookError({ reason: "Invalid Transak JSON body", cause })
            );
          }

          const requireSig = input.requireSignature !== false;
          const secret = transakWebhookSecret(env);
          let payload: Record<string, unknown>;

          if (typeof body.data === "string" && body.data.includes(".")) {
            if (requireSig) {
              if (!secret) {
                return yield* Effect.fail(
                  new OffRampWebhookError({
                    reason:
                      "TRANSAK_ACCESS_TOKEN (or TRANSAK_API_SECRET) required to verify webhook JWT",
                  })
                );
              }
              const verified = verifyTransakWebhookJwt(body.data, secret);
              if (!verified.ok) {
                return yield* Effect.fail(new OffRampWebhookError({ reason: verified.reason }));
              }
              payload = verified.payload;
            } else {
              try {
                const mid = body.data.split(".")[1];
                if (!mid) throw new Error("bad jwt");
                const padded = mid.replace(/-/g, "+").replace(/_/g, "/");
                const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
                payload = JSON.parse(
                  Buffer.from(padded + pad, "base64").toString("utf8")
                ) as Record<string, unknown>;
              } catch (cause) {
                return yield* Effect.fail(
                  new OffRampWebhookError({ reason: "Cannot decode Transak JWT payload", cause })
                );
              }
            }
          } else if (body.webhookData && typeof body.webhookData === "object") {
            payload = body.webhookData as Record<string, unknown>;
            if (requireSig && !secret) {
              return yield* Effect.fail(
                new OffRampWebhookError({
                  reason: "Transak webhook secret required when requireSignature is true",
                })
              );
            }
          } else {
            payload = body;
          }

          const eventId = String(body.eventID ?? body.eventId ?? payload.eventID ?? "");
          const status = String(payload.status ?? payload.orderStatus ?? "");
          const transactionId =
            (typeof payload.id === "string" && payload.id) ||
            (typeof payload.orderId === "string" && payload.orderId) ||
            (typeof payload.partnerOrderId === "string" && payload.partnerOrderId) ||
            eventId ||
            "unknown";
          const amountRaw = payload.cryptoAmount ?? payload.fiatAmount ?? payload.amount;
          const amountUsd =
            typeof amountRaw === "number"
              ? amountRaw
              : typeof amountRaw === "string" && Number.isFinite(Number(amountRaw))
                ? Number(amountRaw)
                : undefined;
          const outcome = classifyTransak(eventId, status);
          const tenantId = input.tenantId?.trim() || "default";
          const correlationId = input.correlationId ?? transactionId;

          if (outcome === "completed") {
            yield* audit
              .appendEntry(
                buildOfframpCompletedEntry({
                  tenantId,
                  transactionId,
                  provider: "transak",
                  amountUsd,
                  correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
          } else if (outcome === "failed") {
            yield* audit
              .appendEntry(
                buildOfframpFailedEntry({
                  tenantId,
                  transactionId,
                  provider: "transak",
                  reason: status || eventId || "failed",
                  amountUsd,
                  correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
          } else if (outcome === "updated") {
            yield* audit
              .appendEntry(
                buildOfframpUpdatedEntry({
                  tenantId,
                  transactionId,
                  provider: "transak",
                  status: status || eventId,
                  amountUsd,
                  correlationId,
                })
              )
              .pipe(Effect.catchAll(() => Effect.void));
          }

          return {
            handled: outcome !== "ignored",
            provider: "transak" as const,
            outcome,
            transactionId,
            status: status || undefined,
            eventType: eventId || undefined,
          } satisfies ProcessOfframpWebhookResult;
        });

      const process = (input: {
        provider: OffRampProvider;
        rawBody: string;
        signatureHeader?: string;
        tenantId?: string;
        correlationId?: string;
        requireSignature?: boolean;
      }) =>
        input.provider === "moonpay"
          ? processMoonpay({
              rawBody: input.rawBody,
              signatureHeader: input.signatureHeader ?? "",
              tenantId: input.tenantId,
              correlationId: input.correlationId,
              requireSignature: input.requireSignature,
            })
          : processTransak({
              rawBody: input.rawBody,
              tenantId: input.tenantId,
              correlationId: input.correlationId,
              requireSignature: input.requireSignature,
            });

      return OfframpWebhookService.of({ processMoonpay, processTransak, process });
    })
  );
}
