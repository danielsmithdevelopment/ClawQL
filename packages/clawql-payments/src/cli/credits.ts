import { Effect } from "effect";
import { AchTopupService } from "../credits/ach-topup-service.js";
import {
  CreditsService,
  creditsTransferShouldStage,
} from "../credits/credits-service.js";
import {
  isAchTopupDryRun,
  isCreditsEnabled,
  isCreditsTransferTotpRequired,
} from "../credits/config.js";
import { enrollStepUpTotp, getStepUpEnrollment } from "../credits/step-up.js";
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

export type PaymentsCreditsTransferOptions = {
  fromTenantId?: string;
  toTenantId?: string;
  amountUsd?: number;
  idempotencyKey?: string;
  correlationId?: string;
  note?: string;
  /** When set with actionId+code, confirm a staged transfer. */
  confirm?: boolean;
  actionId?: string;
  code?: string;
  totp?: string;
  /** Force immediate execute (also requires CLAWQL_CREDITS_TRANSFER_DIRECT=1). */
  direct?: boolean;
  json?: boolean;
};

export type PaymentsCreditsStepUpOptions = {
  tenantId?: string;
  json?: boolean;
  showSecret?: boolean;
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

export async function runPaymentsCreditsTransfer(
  options: PaymentsCreditsTransferOptions = {}
): Promise<number> {
  if (!isCreditsEnabled()) {
    console.error("Credits disabled — set CLAWQL_CREDITS_ENABLED=1");
    return 1;
  }

  // Confirm path
  if (options.confirm || options.actionId?.trim()) {
    const actionId = options.actionId?.trim();
    const code = options.code?.trim();
    if (!actionId || !code) {
      console.error(
        "Usage: clawql payments credits transfer --confirm --action-id UUID --code HEX [--totp NNNNNN]"
      );
      return 1;
    }
    try {
      const result = await runPaymentsEffect(
        Effect.gen(function* () {
          const credits = yield* CreditsService;
          return yield* credits.confirmTransfer({
            actionId,
            code,
            totp: options.totp,
          });
        })
      );
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return 0;
      }
      console.log(
        `Confirmed transfer $${(result.amountCents / 100).toFixed(2)} ${result.fromTenantId} → ${result.toTenantId}`
      );
      console.log(`Transfer id: ${result.transferId}`);
      return 0;
    } catch (err) {
      console.error(formatErr(err));
      return 1;
    }
  }

  const config = await loadPaymentsConfig();
  const fromTenantId = options.fromTenantId?.trim() || config.tenantId || "default";
  const toTenantId = options.toTenantId?.trim();
  const amountUsd = options.amountUsd;
  if (!toTenantId || amountUsd === undefined || !Number.isFinite(amountUsd) || amountUsd <= 0) {
    console.error(
      "Usage: clawql payments credits transfer --to-tenant <tenantId> --amount 10 [--from-tenant <tenantId>]\n" +
        "       clawql payments credits transfer --confirm --action-id UUID --code HEX [--totp NNNNNN]"
    );
    return 1;
  }

  const amountCents = Math.round(amountUsd * 100);
  const shouldStage = creditsTransferShouldStage() && !options.direct;

  try {
    if (!shouldStage) {
      if (creditsTransferShouldStage() && options.direct) {
        console.error(
          "Direct transfer refused — set CLAWQL_CREDITS_TRANSFER_DIRECT=1 for break-glass execute (not recommended)"
        );
        return 1;
      }
      const result = await runPaymentsEffect(
        Effect.gen(function* () {
          const credits = yield* CreditsService;
          return yield* credits.transfer({
            fromTenantId,
            toTenantId,
            amountCents,
            idempotencyKey: options.idempotencyKey,
            correlationId: options.correlationId,
            note: options.note,
          });
        })
      );
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return 0;
      }
      console.log(
        `Transferred $${(result.amountCents / 100).toFixed(2)} ${result.fromTenantId} → ${result.toTenantId}`
      );
      console.log(`Transfer id: ${result.transferId}`);
      return 0;
    }

    const staged = await runPaymentsEffect(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits.stageTransfer({
          fromTenantId,
          toTenantId,
          amountCents,
          idempotencyKey: options.idempotencyKey,
          correlationId: options.correlationId,
          note: options.note,
        });
      })
    );
    if (options.json) {
      console.log(JSON.stringify(staged, null, 2));
      return 0;
    }
    console.log(
      `Staged transfer $${staged.amountUsd.toFixed(2)} ${staged.fromTenantId} → ${staged.toTenantId}`
    );
    console.log(`action_id: ${staged.actionId}`);
    console.log(`confirmation_code: ${staged.confirmationCode}`);
    console.log(`expires: ${staged.expiresAt}`);
    if (staged.totpRequired || isCreditsTransferTotpRequired()) {
      console.log("TOTP required on confirm (CLAWQL_CREDITS_TRANSFER_REQUIRE_TOTP=1)");
    }
    console.log(
      `Confirm: clawql payments credits transfer --confirm --action-id ${staged.actionId} --code ${staged.confirmationCode}${staged.totpRequired ? " --totp NNNNNN" : ""}`
    );
    return 0;
  } catch (err) {
    console.error(formatErr(err));
    return 1;
  }
}

export async function runPaymentsCreditsStepUpEnroll(
  options: PaymentsCreditsStepUpOptions = {}
): Promise<number> {
  const config = await loadPaymentsConfig();
  const tenantId = options.tenantId?.trim() || config.tenantId || "default";
  try {
    const result = await enrollStepUpTotp({ tenantId });
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            tenantId,
            created: result.created,
            enrolledAt: result.enrollment.enrolledAt,
            otpauthUrl: result.otpauthUrl,
            secretBase32: options.showSecret ? result.enrollment.secretBase32 : undefined,
          },
          null,
          2
        )
      );
      return 0;
    }
    console.log(
      result.created
        ? `Enrolled TOTP step-up for tenant ${tenantId}`
        : `TOTP step-up already enrolled for tenant ${tenantId}`
    );
    console.log(`otpauth: ${result.otpauthUrl}`);
    if (options.showSecret) {
      console.log(`secret: ${result.enrollment.secretBase32}`);
    } else {
      console.log("Pass --show-secrets once to print the base32 secret for authenticator apps.");
    }
    console.log("Enable gate: export CLAWQL_CREDITS_TRANSFER_REQUIRE_TOTP=1");
    return 0;
  } catch (err) {
    console.error(formatErr(err));
    return 1;
  }
}

export async function runPaymentsCreditsStepUpShow(
  options: PaymentsCreditsStepUpOptions = {}
): Promise<number> {
  const config = await loadPaymentsConfig();
  const tenantId = options.tenantId?.trim() || config.tenantId || "default";
  const enrollment = await getStepUpEnrollment(tenantId);
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          tenantId,
          enrolled: Boolean(enrollment),
          enrolledAt: enrollment?.enrolledAt,
          totpRequired: isCreditsTransferTotpRequired(),
        },
        null,
        2
      )
    );
    return enrollment ? 0 : 1;
  }
  if (!enrollment) {
    console.log(`No TOTP step-up enrollment for ${tenantId}`);
    return 1;
  }
  console.log(`Tenant ${tenantId}: enrolled at ${enrollment.enrolledAt}`);
  console.log(
    `Transfer TOTP gate: ${isCreditsTransferTotpRequired() ? "ON" : "off (set CLAWQL_CREDITS_TRANSFER_REQUIRE_TOTP=1)"}`
  );
  return 0;
}

function formatErr(err: unknown): string {
  if (err && typeof err === "object" && "reason" in err) {
    return String((err as { reason: unknown }).reason);
  }
  return err instanceof Error ? err.message : String(err);
}
