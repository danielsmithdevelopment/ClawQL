import { Effect } from "effect";
import type { PaymentAuditVerifyResult } from "./chain.js";
import type { PaymentWormEntry } from "./events.js";
import { resetPaymentAuditStoreForTests } from "./factory.js";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";

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
