/**
 * @module audit/worm
 *
 * Promise façades over {@link PaymentAuditService}, the single public Effect surface for
 * WORM payment audit persistence. These functions run the payments Effect runtime
 * internally; new code should depend on `PaymentAuditService` directly. The exports here
 * are retained only for legacy/CLI callers and are marked `@deprecated`.
 */
import { Effect } from "effect";
import type { PaymentAuditVerifyResult } from "./chain.js";
import type { PaymentWormEntry } from "./events.js";
import { resetPaymentAuditStoreForTests } from "./factory.js";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";

/**
 * @deprecated Prefer PaymentAuditService.appendEntry — this Promise façade runs the
 * payments Effect runtime internally and is retained for legacy callers only.
 */
export async function appendPaymentWormEntry(
  entry: PaymentWormEntry,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  await runPaymentsEffect(
    Effect.gen(function* () {
      const audit = yield* PaymentAuditService;
      yield* audit.appendEntry(entry);
    }),
    env
  );
}

/**
 * @deprecated Prefer PaymentAuditService.list — this Promise façade runs the payments
 * Effect runtime internally and is retained for legacy callers only.
 */
export async function listPaymentAuditEntries(
  limit = 100,
  env: NodeJS.ProcessEnv = process.env
): Promise<PaymentWormEntry[]> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const audit = yield* PaymentAuditService;
      return yield* audit.list(limit);
    }),
    env
  );
}

/**
 * @deprecated Prefer PaymentAuditService.verify — this Promise façade runs the payments
 * Effect runtime internally and is retained for legacy callers only.
 */
export async function verifyPaymentAuditLog(
  env: NodeJS.ProcessEnv = process.env
): Promise<PaymentAuditVerifyResult> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const audit = yield* PaymentAuditService;
      return yield* audit.verify();
    }),
    env
  );
}

export { resetPaymentAuditStoreForTests };
