import { Context, Effect, Layer } from "effect";
import type { PaymentWormEntry } from "../audit/events.js";
import type { PaymentWormRecord } from "../audit/chain.js";
import { getPaymentAuditStore } from "../audit/factory.js";
import type { PaymentAuditStore } from "../audit/store.js";
import { PaymentError } from "../errors/payment-errors.js";

/** Effect service for WORM payment audit persistence. */
export class PaymentAuditService extends Context.Tag("clawql/PaymentAuditService")<
  PaymentAuditService,
  {
    readonly store: PaymentAuditStore;
    readonly append: (entry: PaymentWormEntry) => Effect.Effect<PaymentWormRecord, PaymentError>;
    readonly reset: () => Effect.Effect<void, PaymentError>;
  }
>() {}

export function paymentAuditLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<PaymentAuditService> {
  const store = getPaymentAuditStore(env);
  return Layer.succeed(
    PaymentAuditService,
    PaymentAuditService.of({
      store,
      append: (entry) =>
        Effect.tryPromise({
          try: () => store.append(entry),
          catch: (cause) =>
            new PaymentError({
              reason: "payment audit append failed",
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
    })
  );
}
