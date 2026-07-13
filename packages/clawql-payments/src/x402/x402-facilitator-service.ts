import { Context, Effect, Layer } from "effect";
import { X402Error } from "../errors/payment-errors.js";
import {
  resolveFacilitatorAuthHeaders,
  resolveFacilitatorEndpoint,
} from "./x402-runtime-config-service.js";
import type {
  X402FacilitatorSettleResponse,
  X402FacilitatorVerifyRequest,
  X402FacilitatorVerifyResponse,
  X402PaymentPayloadV2,
  X402PaymentRequirements,
} from "./types.js";
import { X402_VERSION } from "./types.js";

export type X402FacilitatorVerifyInput = {
  facilitatorUrl: string;
  paymentPayload: X402PaymentPayloadV2;
  paymentRequirements: X402PaymentRequirements;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
};

export type X402FacilitatorVerifyResult =
  | { verified: true; settlementId: string; payer?: string }
  | { verified: false; reason: string; payer?: string };

export type X402FacilitatorSettleInput = X402FacilitatorVerifyInput;

export type X402FacilitatorSettleResult =
  | { settled: true; transaction: string }
  | { settled: false; reason: string };

function postFacilitatorJsonEffect<T>(
  url: string,
  body: unknown,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch
): Effect.Effect<{ ok: boolean; status: number; json: T | undefined; text: string }, X402Error> {
  return Effect.tryPromise({
    try: async () => {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...resolveFacilitatorAuthHeaders(env),
        },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let json: T | undefined;
      try {
        json = text ? (JSON.parse(text) as T) : undefined;
      } catch {
        json = undefined;
      }
      return { ok: response.ok, status: response.status, json, text };
    },
    catch: (cause) =>
      new X402Error({
        reason: "facilitator HTTP request failed",
        cause,
      }),
  });
}

/** Effect service for x402 facilitator verify/settle HTTP calls. */
export class X402FacilitatorService extends Context.Tag("clawql/X402FacilitatorService")<
  X402FacilitatorService,
  {
    readonly verify: (input: X402FacilitatorVerifyInput) => Effect.Effect<X402FacilitatorVerifyResult, X402Error>;
    readonly settle: (input: X402FacilitatorSettleInput) => Effect.Effect<X402FacilitatorSettleResult, X402Error>;
  }
>() {}

export function x402FacilitatorLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<X402FacilitatorService> {
  return Layer.succeed(
    X402FacilitatorService,
    X402FacilitatorService.of({
      verify: (input) => {
        if (!input.facilitatorUrl.startsWith("http")) {
          return Effect.succeed({ verified: false as const, reason: "invalid facilitator URL" });
        }
        const runEnv = input.env ?? env;
        const fetchImpl = input.fetchImpl ?? fetch;
        const verifyUrl = resolveFacilitatorEndpoint(input.facilitatorUrl, "verify");
        const request: X402FacilitatorVerifyRequest = {
          x402Version: X402_VERSION,
          paymentPayload: input.paymentPayload,
          paymentRequirements: input.paymentRequirements,
        };
        return Effect.gen(function* () {
          const result = yield* postFacilitatorJsonEffect<X402FacilitatorVerifyResponse>(
            verifyUrl,
            request,
            runEnv,
            fetchImpl
          );
          if (!result.ok || !result.json) {
            return {
              verified: false as const,
              reason: result.text || `facilitator verify failed (${result.status})`,
              payer: result.json?.payer,
            };
          }
          if (!result.json.isValid) {
            return {
              verified: false as const,
              reason: result.json.invalidReason ?? "payment invalid",
              payer: result.json.payer,
            };
          }
          return {
            verified: true as const,
            settlementId: `x402_verify_${Date.now().toString(36)}`,
            payer: result.json.payer,
          };
        });
      },
      settle: (input) => {
        const runEnv = input.env ?? env;
        const fetchImpl = input.fetchImpl ?? fetch;
        const settleUrl = resolveFacilitatorEndpoint(input.facilitatorUrl, "settle");
        const request: X402FacilitatorVerifyRequest = {
          x402Version: X402_VERSION,
          paymentPayload: input.paymentPayload,
          paymentRequirements: input.paymentRequirements,
        };
        return Effect.gen(function* () {
          const result = yield* postFacilitatorJsonEffect<X402FacilitatorSettleResponse>(
            settleUrl,
            request,
            runEnv,
            fetchImpl
          );
          if (!result.ok || !result.json) {
            return {
              settled: false as const,
              reason: result.text || `facilitator settle failed (${result.status})`,
            };
          }
          if (!result.json.success || !result.json.transaction) {
            return {
              settled: false as const,
              reason: result.json.errorReason ?? "settlement failed",
            };
          }
          return {
            settled: true as const,
            transaction: result.json.transaction,
          };
        });
      },
    })
  );
}
