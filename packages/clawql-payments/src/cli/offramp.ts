import { readFile } from "node:fs/promises";
import { Effect } from "effect";
import { ConsumerOffRampService } from "../offramp/consumer-offramp-service.js";
import { OfframpWebhookService } from "../offramp/offramp-webhook-service.js";
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

export type PaymentsOfframpWebhookOptions = {
  provider?: OffRampProvider;
  payloadPath?: string;
  signature?: string;
  tenantId?: string;
  process?: boolean;
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

export async function runPaymentsOfframpWebhook(
  options: PaymentsOfframpWebhookOptions = {}
): Promise<number> {
  const provider = options.provider ?? "moonpay";
  if (!options.payloadPath?.trim()) {
    console.error(
      "Usage: clawql payments offramp webhook --provider moonpay|transak --payload ./body.json [--signature t=…,s=…] [--process]"
    );
    return 1;
  }
  const rawBody = await readFile(options.payloadPath, "utf8");
  if (!options.process) {
    if (options.json) {
      console.log(JSON.stringify({ provider, verified: true, process: false }, null, 2));
    } else {
      console.log(
        `Loaded ${provider} webhook payload (${rawBody.length} bytes). Pass --process to verify + WORM settle.`
      );
    }
    return 0;
  }
  const result = await runPaymentsEffect(
    Effect.gen(function* () {
      const wh = yield* OfframpWebhookService;
      return yield* wh.process({
        provider,
        rawBody,
        signatureHeader: options.signature,
        tenantId: options.tenantId,
      });
    })
  );
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `Off-ramp webhook ${result.provider}: ${result.outcome}${result.transactionId ? ` (${result.transactionId})` : ""}${result.handled ? "" : " [ignored]"}`
    );
  }
  return 0;
}
