import { Context, Effect, Layer } from "effect";
import { PaymentsConfigService } from "../config/payments-config-service.js";
import { X402Error } from "../errors/payment-errors.js";
import type { X402Scheme } from "./types.js";

export type X402RuntimeConfig = {
  network: string;
  scheme: X402Scheme;
  usdcAsset: string;
  facilitatorUrl?: string;
  walletAddress?: string;
  maxTimeoutSeconds: number;
};

const DEFAULT_NETWORK = "eip155:84532";
const DEFAULT_SCHEME: X402Scheme = "exact";
const DEFAULT_USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const DEFAULT_FACILITATOR = "https://x402.org/facilitator";

export function isX402EnforcementActive(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_X402_ENFORCE?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function usdcAtomicAmount(priceUsdc: number): string {
  return Math.round(priceUsdc * 1_000_000).toString();
}

export function resolveFacilitatorEndpoint(baseUrl: string, action: "verify" | "settle"): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith(`/${action}`)) return trimmed;
  if (trimmed.endsWith("/x402")) return `${trimmed}/${action}`;
  return `${trimmed}/${action}`;
}

export function resolveFacilitatorAuthHeaders(
  env: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  const bearer = env.CLAWQL_X402_FACILITATOR_BEARER?.trim();
  if (bearer) {
    return { Authorization: `Bearer ${bearer}` };
  }
  const apiKeyId = env.CDP_API_KEY_ID?.trim();
  const apiKeySecret = env.CDP_API_KEY_SECRET?.trim();
  if (apiKeyId && apiKeySecret) {
    return {
      "X-Cb-Project-Id": apiKeyId,
      "X-Cb-Access-Key": apiKeySecret,
    };
  }
  return {};
}

/** Effect service for x402 runtime configuration (network, facilitator, wallet). */
export class X402RuntimeConfigService extends Context.Tag("clawql/X402RuntimeConfigService")<
  X402RuntimeConfigService,
  {
    readonly load: () => Effect.Effect<X402RuntimeConfig, X402Error>;
  }
>() {}

export function x402RuntimeConfigLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<X402RuntimeConfigService, never, PaymentsConfigService> {
  return Layer.effect(
    X402RuntimeConfigService,
    Effect.gen(function* () {
      const configService = yield* PaymentsConfigService;
      return X402RuntimeConfigService.of({
        load: () =>
          Effect.gen(function* () {
            const payments = yield* configService.load();
            const maxTimeoutRaw = env.CLAWQL_X402_MAX_TIMEOUT_SECONDS?.trim();
            const maxTimeoutSeconds = maxTimeoutRaw ? Number.parseInt(maxTimeoutRaw, 10) : 60;
            return {
              network: env.CLAWQL_X402_NETWORK?.trim() || DEFAULT_NETWORK,
              scheme: (env.CLAWQL_X402_SCHEME?.trim() as X402Scheme | undefined) || DEFAULT_SCHEME,
              usdcAsset: env.CLAWQL_X402_USDC_ASSET?.trim() || DEFAULT_USDC_BASE_SEPOLIA,
              facilitatorUrl:
                payments.x402.facilitatorUrl?.trim() ||
                env.CLAWQL_X402_FACILITATOR_URL?.trim() ||
                DEFAULT_FACILITATOR,
              walletAddress: payments.x402.walletAddress,
              maxTimeoutSeconds: Number.isFinite(maxTimeoutSeconds) ? maxTimeoutSeconds : 60,
            };
          }).pipe(
            Effect.mapError(
              (cause) =>
                new X402Error({
                  reason: "failed to load x402 runtime config",
                  cause,
                })
            )
          ),
      });
    })
  );
}
