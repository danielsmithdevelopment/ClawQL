import {
  loadX402RuntimeConfig,
  resolveFacilitatorAuthHeaders,
  resolveFacilitatorEndpoint,
} from "./config.js";
import type {
  X402FacilitatorSettleResponse,
  X402FacilitatorVerifyRequest,
  X402FacilitatorVerifyResponse,
  X402PaymentRequirements,
  X402PaymentPayloadV2,
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

async function postFacilitatorJson<T>(
  url: string,
  body: unknown,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch
): Promise<{ ok: boolean; status: number; json: T | undefined; text: string }> {
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
}

export async function verifyViaFacilitator(
  input: X402FacilitatorVerifyInput
): Promise<X402FacilitatorVerifyResult> {
  if (!input.facilitatorUrl.startsWith("http")) {
    return { verified: false, reason: "invalid facilitator URL" };
  }

  const env = input.env ?? process.env;
  const fetchImpl = input.fetchImpl ?? fetch;
  const verifyUrl = resolveFacilitatorEndpoint(input.facilitatorUrl, "verify");
  const request: X402FacilitatorVerifyRequest = {
    x402Version: X402_VERSION,
    paymentPayload: input.paymentPayload,
    paymentRequirements: input.paymentRequirements,
  };

  const result = await postFacilitatorJson<X402FacilitatorVerifyResponse>(
    verifyUrl,
    request,
    env,
    fetchImpl
  );

  if (!result.ok || !result.json) {
    return {
      verified: false,
      reason: result.text || `facilitator verify failed (${result.status})`,
      payer: result.json?.payer,
    };
  }

  if (!result.json.isValid) {
    return {
      verified: false,
      reason: result.json.invalidReason ?? "payment invalid",
      payer: result.json.payer,
    };
  }

  return {
    verified: true,
    settlementId: `x402_verify_${Date.now().toString(36)}`,
    payer: result.json.payer,
  };
}

export async function settleViaFacilitator(
  input: X402FacilitatorSettleInput
): Promise<X402FacilitatorSettleResult> {
  const env = input.env ?? process.env;
  const fetchImpl = input.fetchImpl ?? fetch;
  const settleUrl = resolveFacilitatorEndpoint(input.facilitatorUrl, "settle");
  const request: X402FacilitatorVerifyRequest = {
    x402Version: X402_VERSION,
    paymentPayload: input.paymentPayload,
    paymentRequirements: input.paymentRequirements,
  };

  const result = await postFacilitatorJson<X402FacilitatorSettleResponse>(
    settleUrl,
    request,
    env,
    fetchImpl
  );

  if (!result.ok || !result.json) {
    return {
      settled: false,
      reason: result.text || `facilitator settle failed (${result.status})`,
    };
  }

  if (!result.json.success || !result.json.transaction) {
    return {
      settled: false,
      reason: result.json.errorReason ?? "settlement failed",
    };
  }

  return {
    settled: true,
    transaction: result.json.transaction,
  };
}

export async function verifyViaConfiguredFacilitator(input: {
  paymentPayload: X402PaymentPayloadV2;
  paymentRequirements: X402PaymentRequirements;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<X402FacilitatorVerifyResult> {
  const config = await loadX402RuntimeConfig(input.env);
  if (!config.facilitatorUrl) {
    return { verified: false, reason: "x402 facilitator URL is not configured" };
  }
  return verifyViaFacilitator({
    facilitatorUrl: config.facilitatorUrl,
    paymentPayload: input.paymentPayload,
    paymentRequirements: input.paymentRequirements,
    env: input.env,
    fetchImpl: input.fetchImpl,
  });
}
