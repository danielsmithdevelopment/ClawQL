import { Effect } from "effect";
import { AchTopupService } from "../credits/ach-topup-service.js";
import { CreditsService } from "../credits/credits-service.js";
import { isAchTopupDryRun, isCreditsEnabled } from "../credits/config.js";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import { loadPaymentsConfig } from "../config/store.js";

export type PaymentsCreditsShowOptions = {
  tenantId?: string;
};

export type PaymentsCreditsBankLinkOptions = {
  customerId?: string;
  tenantId?: string;
  returnUrl?: string;
};

export type PaymentsCreditsTopupOptions = {
  customerId?: string;
  amountUsd?: number;
  paymentMethodId?: string;
  tenantId?: string;
};

export async function runPaymentsCreditsShow(
  options: PaymentsCreditsShowOptions = {}
): Promise<number> {
  if (!isCreditsEnabled()) {
    console.error("Credits disabled — set CLAWQL_CREDITS_ENABLED=1");
    return 1;
  }
  const config = await loadPaymentsConfig();
  const tenantId = options.tenantId?.trim() || config.tenantId || "default";
  const account = await runPaymentsEffect(
    Effect.gen(function* () {
      const credits = yield* CreditsService;
      return yield* credits.getBalance(tenantId);
    })
  );
  console.log(`Tenant: ${account.tenantId}`);
  console.log(`Balance: $${(account.balanceCents / 100).toFixed(2)} (${account.balanceCents}¢)`);
  console.log(`Updated: ${account.updatedAt}`);
  console.log(`Ledger entries: ${account.entries.length}`);
  for (const e of account.entries.slice(-10)) {
    console.log(
      `  ${e.ts} ${e.kind} ${e.deltaCents}¢ → ${e.balanceAfterCents}¢${e.paymentIntentId ? ` (${e.paymentIntentId})` : ""}`
    );
  }
  return 0;
}

export async function runPaymentsCreditsBankLink(
  options: PaymentsCreditsBankLinkOptions = {}
): Promise<number> {
  const config = await loadPaymentsConfig();
  const customerId = options.customerId?.trim() || config.stripe?.customerId?.trim();
  if (!customerId) {
    console.error(
      "Usage: clawql payments credits bank-link --customer cus_xxx  (or save customer via stripe customer create)"
    );
    return 1;
  }
  const tenantId = options.tenantId?.trim() || config.tenantId || "default";
  const session = await runPaymentsEffect(
    Effect.gen(function* () {
      const ach = yield* AchTopupService;
      return yield* ach.createBankLinkSession({
        customerId,
        tenantId,
        returnUrl: options.returnUrl,
      });
    })
  );
  console.log(`Financial Connections session: ${session.id}`);
  console.log(`client_secret: ${session.clientSecret}`);
  console.log(`customer: ${session.customerId}`);
  if (session.dryRun) {
    console.log("dry-run: set CLAWQL_ACH_TOPUP_DRY_RUN=0 for live Stripe FC sessions");
  } else {
    console.log(
      "Collect the bank account in Stripe.js / Link with this client_secret, then top up with the resulting pm_…"
    );
  }
  return 0;
}

export async function runPaymentsCreditsTopup(
  options: PaymentsCreditsTopupOptions = {}
): Promise<number> {
  const config = await loadPaymentsConfig();
  const customerId = options.customerId?.trim() || config.stripe?.customerId?.trim();
  const amountUsd = options.amountUsd;
  if (!customerId || amountUsd === undefined || !Number.isFinite(amountUsd)) {
    console.error(
      "Usage: clawql payments credits topup --customer cus_xxx --amount 25 [--payment-method pm_xxx]"
    );
    return 1;
  }
  const tenantId = options.tenantId?.trim() || config.tenantId || "default";
  if (!isAchTopupDryRun() && !options.paymentMethodId?.trim()) {
    console.error("Live top-up requires --payment-method pm_xxx (from Financial Connections)");
    return 1;
  }
  const result = await runPaymentsEffect(
    Effect.gen(function* () {
      const ach = yield* AchTopupService;
      return yield* ach.createTopup({
        customerId,
        amountUsd,
        paymentMethodId: options.paymentMethodId,
        tenantId,
      });
    })
  );
  console.log(`PaymentIntent: ${result.paymentIntentId}`);
  console.log(`Status: ${result.status}`);
  console.log(`Amount: $${(result.amountCents / 100).toFixed(2)}`);
  if (result.settledImmediately) {
    console.log("Credits settled immediately (succeeded / dry-run).");
  } else {
    console.log("Credits settle on payment_intent.succeeded webhook (ACH may take days).");
  }
  return 0;
}
