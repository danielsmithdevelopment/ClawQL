import { Effect } from "effect";
import { CloudflareWalletService } from "../cloudflare-wallets/cloudflare-wallet-service.js";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";

export type PaymentsCfwHandleOptions = {
  handle?: string;
  tenantId?: string;
  json?: boolean;
};

export type PaymentsCfwWalletCreateOptions = {
  agentId?: string;
  allowanceUsd?: number;
  maxTxUsd?: number;
  merchants?: string[];
  handle?: string;
  tenantId?: string;
  json?: boolean;
};

export type PaymentsCfwWalletStatusOptions = {
  walletId?: string;
  json?: boolean;
};

export type PaymentsCfwWalletRevokeOptions = {
  walletId?: string;
  tenantId?: string;
  json?: boolean;
};

export async function runPaymentsCfwHandleResolve(
  options: PaymentsCfwHandleOptions = {}
): Promise<number> {
  const result = await runPaymentsEffect(
    Effect.gen(function* () {
      const cfw = yield* CloudflareWalletService;
      return yield* cfw.resolveHandle({
        handle: options.handle,
        tenantId: options.tenantId,
      });
    })
  );
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `Cloudflare handle ${result.handle} — ${result.status}${result.oneOfOne ? " · ONE OF ONE" : ""}${result.dryRun ? " [dry-run]" : ""}`
    );
    console.log(`URI: ${result.uri}`);
    console.log(`${result.category} · ${result.scope.replace(/_/g, " & ")}`);
  }
  return 0;
}

export async function runPaymentsCfwWalletCreate(
  options: PaymentsCfwWalletCreateOptions = {}
): Promise<number> {
  if (!options.agentId?.trim() || options.allowanceUsd === undefined) {
    console.error(
      "Usage: clawql payments cloudflare-wallet virtual-wallet create --agent AGENT --allowance 50 [--max-tx 10] [--merchant URL]"
    );
    return 1;
  }
  const result = await runPaymentsEffect(
    Effect.gen(function* () {
      const cfw = yield* CloudflareWalletService;
      return yield* cfw.createVirtualWallet({
        agentId: options.agentId!,
        allowanceUsd: options.allowanceUsd!,
        maxTxUsd: options.maxTxUsd,
        merchantAllowList: options.merchants,
        handle: options.handle,
        tenantId: options.tenantId,
      });
    })
  );
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `Virtual Wallet ${result.id} for ${result.agentId}: $${result.allowanceUsd.toFixed(2)} cap${result.dryRun ? " [dry-run]" : ""}`
    );
    console.log(`Handle: ${result.handle}`);
    if (result.credentialHint) console.log(`Credential hint: ${result.credentialHint}`);
  }
  return 0;
}

export async function runPaymentsCfwWalletStatus(
  options: PaymentsCfwWalletStatusOptions = {}
): Promise<number> {
  if (!options.walletId?.trim()) {
    console.error("Usage: clawql payments cloudflare-wallet virtual-wallet status --wallet-id ID");
    return 1;
  }
  const result = await runPaymentsEffect(
    Effect.gen(function* () {
      const cfw = yield* CloudflareWalletService;
      return yield* cfw.getSpendStatus({ walletId: options.walletId! });
    })
  );
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `Virtual Wallet ${result.id}: ${result.status} · remaining $${result.remainingUsd.toFixed(2)} / $${result.allowanceUsd.toFixed(2)}`
    );
  }
  return 0;
}

export async function runPaymentsCfwWalletRevoke(
  options: PaymentsCfwWalletRevokeOptions = {}
): Promise<number> {
  if (!options.walletId?.trim()) {
    console.error("Usage: clawql payments cloudflare-wallet virtual-wallet revoke --wallet-id ID");
    return 1;
  }
  const result = await runPaymentsEffect(
    Effect.gen(function* () {
      const cfw = yield* CloudflareWalletService;
      return yield* cfw.revokeVirtualWallet({
        walletId: options.walletId!,
        tenantId: options.tenantId,
      });
    })
  );
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Virtual Wallet ${result.id} revoked${result.dryRun ? " [dry-run]" : ""}`);
  }
  return 0;
}
