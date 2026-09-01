import { appendPaymentEventToWormEffect } from "clawql-audit";
import { AuditService } from "clawql-core";
import { Context, Effect, Layer } from "effect";
import type { PaymentAuditVerifyResult } from "../audit/chain.js";
import type { PaymentWormEntry } from "../audit/events.js";
import { getPaymentAuditStore } from "../audit/factory.js";
import { LokiPushService } from "../audit/loki.js";
import type { PaymentAuditStore } from "../audit/store.js";
import { isPaymentAuditLokiPushEnabled } from "../audit/store.js";
import type { PaymentWormRecord } from "../audit/chain.js";
import { PaymentError } from "../errors/payment-errors.js";

/** Effect service for WORM payment audit persistence. */
export class PaymentAuditService extends Context.Tag("clawql/PaymentAuditService")<
  PaymentAuditService,
  {
    readonly store: PaymentAuditStore;
    readonly append: (entry: PaymentWormEntry) => Effect.Effect<PaymentWormRecord, PaymentError>;
    /** Persist + mirror to in-process audit ring buffer and optional Loki push. */
    readonly appendEntry: (
      entry: PaymentWormEntry
    ) => Effect.Effect<PaymentWormRecord, PaymentError>;
    readonly list: (limit?: number) => Effect.Effect<PaymentWormEntry[], PaymentError>;
    readonly verify: () => Effect.Effect<PaymentAuditVerifyResult, PaymentError>;
    readonly reset: () => Effect.Effect<void, PaymentError>;
  }
>() {}

/**
 * Live payment audit Layer. Requires {@link AuditService} for MCP ring-buffer mirror
 * (`appendEntry`) and {@link LokiPushService} for optional Loki push.
 * Callers should `Layer.provide` `AuditLive` (or `AuditTestLayer`) and `lokiPushLiveLayer`.
 */
export function paymentAuditLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<PaymentAuditService, never, AuditService | LokiPushService> {
  const store = getPaymentAuditStore(env);

  const appendRaw = (entry: PaymentWormEntry) =>
    Effect.tryPromise({
      try: () => store.append(entry),
      catch: (cause) =>
        new PaymentError({
          reason: "payment audit append failed",
          cause,
        }),
    });

  return Layer.effect(
    PaymentAuditService,
    Effect.gen(function* () {
      const clawqlAudit = yield* AuditService;
      const loki = yield* LokiPushService;
      return PaymentAuditService.of({
        store,
        append: appendRaw,
        appendEntry: (entry) =>
          Effect.gen(function* () {
            const record = yield* appendRaw(entry);
            yield* clawqlAudit.append({
              category: entry.category,
              action: entry.action,
              summary: entry.summary,
              correlationId: entry.correlationId,
            });
            // Dual-write to process clawql-audit trail when CLAWQL_WORM_ENABLED=1.
            yield* appendPaymentEventToWormEffect({
              ts: entry.ts,
              category: entry.category,
              action: entry.action,
              summary: entry.summary,
              correlationId: entry.correlationId,
              payload: entry.payload as unknown as Record<string, unknown>,
            }).pipe(Effect.catchAll(() => Effect.succeed(null)));
            if (isPaymentAuditLokiPushEnabled(env)) {
              // Fire-and-forget: Loki must not block WORM append.
              yield* Effect.forkDaemon(
                loki.push(entry).pipe(
                  Effect.catchAll((err) =>
                    Effect.sync(() => {
                      console.error("[clawql-payments-audit-loki] push failed:", err.reason);
                    })
                  )
                )
              );
            }
            return record;
          }),
        list: (limit = 100) =>
          Effect.tryPromise({
            try: () => store.list(limit),
            catch: (cause) =>
              new PaymentError({
                reason: "payment audit list failed",
                cause,
              }),
          }),
        verify: () =>
          Effect.tryPromise({
            try: () => store.verify(),
            catch: (cause) =>
              new PaymentError({
                reason: "payment audit verify failed",
                cause,
              }),
          }),
        reset: () =>
          Effect.tryPromise({
            try: () => store.reset(),
            catch: (cause) =>
              new PaymentError({
                reason: "payment audit reset failed",
                cause,
              }),
          }),
      });
    })
  );
}
