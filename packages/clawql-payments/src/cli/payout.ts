import { Effect } from "effect";
import { PayoutService } from "../payouts/payout-service.js";
import type { PayoutMethod } from "../payouts/preferences.js";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";

export type PaymentsPayoutConnectCreateOptions = {
  email?: string;
  country?: string;
  creatorId?: string;
  tenantId?: string;
  json?: boolean;
};

export type PaymentsPayoutConnectLinkOptions = {
  accountId?: string;
  returnUrl?: string;
  refreshUrl?: string;
  json?: boolean;
};

export type PaymentsPayoutCreateOptions = {
  amountUsd?: number;
  destination?: PayoutMethod;
  accountId?: string;
  wallet?: string;
  creatorId?: string;
  tenantId?: string;
  description?: string;
  json?: boolean;
};

export type PaymentsPayoutPreferOptions = {
  creatorId?: string;
  method?: PayoutMethod;
  accountId?: string;
  wallet?: string;
  email?: string;
  json?: boolean;
};

export async function runPaymentsPayoutConnectCreate(
  options: PaymentsPayoutConnectCreateOptions = {}
): Promise<number> {
  if (!options.email?.trim()) {
    console.error("Usage: clawql payments payout connect create --email creator@example.com");
    return 1;
  }
  const result = await runPaymentsEffect(
    Effect.gen(function* () {
      const payouts = yield* PayoutService;
      return yield* payouts.createConnectAccount({
        email: options.email!,
        country: options.country,
        creatorId: options.creatorId,
        tenantId: options.tenantId,
      });
    })
  );
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Connect account: ${result.id}${result.dryRun ? " [dry-run]" : ""}`);
    if (result.email) console.log(`Email: ${result.email}`);
  }
  return 0;
}

export async function runPaymentsPayoutConnectLink(
  options: PaymentsPayoutConnectLinkOptions = {}
): Promise<number> {
  if (!options.accountId?.trim()) {
    console.error("Usage: clawql payments payout connect link --account acct_xxx");
    return 1;
  }
  const result = await runPaymentsEffect(
    Effect.gen(function* () {
      const payouts = yield* PayoutService;
      return yield* payouts.createOnboardingLink({
        accountId: options.accountId!,
        returnUrl: options.returnUrl,
        refreshUrl: options.refreshUrl,
      });
    })
  );
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Onboarding URL: ${result.url}${result.dryRun ? " [dry-run]" : ""}`);
  }
  return 0;
}

export async function runPaymentsPayoutCreate(
  options: PaymentsPayoutCreateOptions = {}
): Promise<number> {
  if (options.amountUsd === undefined || !Number.isFinite(options.amountUsd)) {
    console.error(
      "Usage: clawql payments payout create --amount 25 [--destination bank|usdc] [--account acct_xxx | --wallet 0x...]"
    );
    return 1;
  }
  const result = await runPaymentsEffect(
    Effect.gen(function* () {
      const payouts = yield* PayoutService;
      return yield* payouts.createPayout({
        amountUsd: options.amountUsd!,
        destination: options.destination,
        connectAccountId: options.accountId,
        usdcWallet: options.wallet,
        creatorId: options.creatorId,
        tenantId: options.tenantId,
        description: options.description,
      });
    })
  );
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `Payout ${result.id}: $${(result.amountCents / 100).toFixed(2)} → ${result.destination} (${result.status})${result.dryRun ? " [dry-run]" : ""}`
    );
  }
  return 0;
}

export async function runPaymentsPayoutPrefer(
  options: PaymentsPayoutPreferOptions = {}
): Promise<number> {
  if (!options.creatorId?.trim() || !options.method) {
    console.error(
      "Usage: clawql payments payout prefer --creator id --method bank|usdc [--account acct_xxx | --wallet 0x...]"
    );
    return 1;
  }
  const result = await runPaymentsEffect(
    Effect.gen(function* () {
      const payouts = yield* PayoutService;
      return yield* payouts.setPreference({
        creatorId: options.creatorId!,
        method: options.method!,
        connectAccountId: options.accountId,
        usdcWallet: options.wallet,
        email: options.email,
      });
    })
  );
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `Preference ${result.creatorId}: ${result.method}` +
        (result.connectAccountId ? ` account=${result.connectAccountId}` : "") +
        (result.usdcWallet ? ` wallet=${result.usdcWallet}` : "")
    );
  }
  return 0;
}
