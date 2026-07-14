import {
  AuditService,
  AuditTestLayer,
  getDefaultAuditRingBuffer,
  resetDefaultAuditRingBufferForTests,
} from "clawql-core";
import { Effect, Either, Layer } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { buildX402PaymentReceivedEntry } from "../audit/events.js";
import { PaymentAuditService, paymentAuditLiveLayer } from "./payment-audit-service.js";
import { PaymentError } from "../errors/payment-errors.js";

describe("PaymentAuditService", () => {
  afterEach(() => {
    resetDefaultAuditRingBufferForTests();
  });

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

    await Effect.runPromise(
      program.pipe(Effect.provide(paymentAuditLiveLayer(env)), Effect.provide(AuditTestLayer))
    );
  });

  it("appendEntry mirrors into AuditService (isolated test layer)", async () => {
    const env = {
      ...process.env,
      CLAWQL_PAYMENTS_AUDIT_STORE: "memory",
    };
    const entry = buildX402PaymentReceivedEntry({
      tenantId: "t1",
      amountUsdc: 0.002,
      resource: "tool:execute",
      correlationId: "c-mirror",
    });
    const listed = await Effect.runPromise(
      Effect.gen(function* () {
        const paymentAudit = yield* PaymentAuditService;
        yield* paymentAudit.appendEntry(entry);
        const clawqlAudit = yield* AuditService;
        return yield* clawqlAudit.list(5);
      }).pipe(Effect.provide(paymentAuditLiveLayer(env)), Effect.provide(AuditTestLayer))
    );
    expect(listed.entries.some((e) => e.correlationId === "c-mirror")).toBe(true);
    expect(getDefaultAuditRingBuffer().list(5).entries).toHaveLength(0);
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
        verify: async () => ({ ok: true, records: 0, head_hash: "0".repeat(64), issues: [] }),
        reset: async () => undefined,
      },
      append: (entry) =>
        Effect.tryPromise({
          try: () => broken.store.append(entry),
          catch: (cause) => new PaymentError({ reason: "append failed", cause }),
        }),
      appendEntry: (entry) =>
        Effect.tryPromise({
          try: () => broken.store.append(entry),
          catch: (cause) => new PaymentError({ reason: "append failed", cause }),
        }),
      list: () => Effect.succeed([]),
      verify: () => Effect.succeed({ ok: true, records: 0, head_hash: "0".repeat(64), issues: [] }),
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
