import { Effect } from "effect";
import { ConsumerOffRampService } from "../offramp/consumer-offramp-service.js";
import type { OffRampProvider } from "../offramp/config.js";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";

export type PaymentsOfframpSessionOptions = {
  amountUsd?: number;
  wallet?: string;
  provider?: OffRampProvider;
  email?: string;
  returnUrl?: string;
  tenantId?: string;
  creatorId?: string;
  json?: boolean;
};

export async function runPaymentsOfframpSession(
  options: PaymentsOfframpSessionOptions = {}
): Promise<number> {
  if (
    options.amountUsd === undefined ||
    !Number.isFinite(options.amountUsd) ||
    !options.wallet?.trim()
  ) {
    console.error(
      "Usage: clawql payments offramp session --amount 25 --wallet 0x… [--provider moonpay|transak]"
    );
    return 1;
  }
  const result = await runPaymentsEffect(
    Effect.gen(function* () {
      const offramp = yield* ConsumerOffRampService;
      return yield* offramp.createSession({
        amountUsd: options.amountUsd!,
        walletAddress: options.wallet!,
        provider: options.provider,
        email: options.email,
        redirectUrl: options.returnUrl,
        tenantId: options.tenantId,
        creatorId: options.creatorId,
      });
    })
  );
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `Off-ramp ${result.provider} session ${result.id}${result.dryRun ? " [dry-run]" : ""}`
    );
    console.log(`URL: ${result.url}`);
  }
  return 0;
}
