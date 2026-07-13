import { Effect, Either, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { buildX402PaymentReceivedEntry } from "../audit/events.js";
import { PaymentAuditService, paymentAuditLiveLayer } from "./payment-audit-service.js";
import { PaymentError } from "../errors/payment-errors.js";

describe("PaymentAuditService", () => {
  it("append persists via Effect layer", async () => {
    const env = {
      ...process.env,
      CLAWQL_PAYMENTS_AUDIT_STORE: "memory",
    };
    const entry = buildX402PaymentReceivedEntry({
      tenantId: "t1",
      amountUsdc: 0.001,
      resource: "tool:search",
      correlationId: "c1",
    });
    const program = Effect.gen(function* () {
      const audit = yield* PaymentAuditService;
      const record = yield* audit.append(entry);
      expect(record.seq).toBeGreaterThan(0);
    });

    await Effect.runPromise(program.pipe(Effect.provide(paymentAuditLiveLayer(env))));
  });

  it("maps store failures to PaymentError", async () => {
    const entry = buildX402PaymentReceivedEntry({
      tenantId: "t1",
      amountUsdc: 0.001,
      resource: "tool:search",
      correlationId: "c1",
    });
    const broken = PaymentAuditService.of({
      store: {
        append: async () => {
          throw new Error("disk full");
        },
        list: async () => [],
        listRecords: async () => [],
        verify: async () => ({ ok: true, entries: 0 }),
        reset: async () => undefined,
      },
      append: (entry) =>
        Effect.tryPromise({
          try: () => broken.store.append(entry),
          catch: (cause) => new PaymentError({ reason: "append failed", cause }),
        }),
      reset: () => Effect.void,
    });

    const program = Effect.gen(function* () {
      const audit = yield* PaymentAuditService;
      yield* audit.append(entry);
    });

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(Layer.succeed(PaymentAuditService, broken)), Effect.either)
    );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(PaymentError);
    }
  });
});
