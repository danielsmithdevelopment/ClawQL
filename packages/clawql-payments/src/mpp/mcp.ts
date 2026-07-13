import type { X402PaymentRequired } from "../x402/types.js";
import { buildChallengesFromOffers, buildMppPaymentRequiredBody } from "./challenge.js";
import type { MppPaymentOffer } from "./types.js";
import {
  MPP_CREDENTIAL_META_KEY,
  MPP_MCP_PAYMENT_REQUIRED_CODE,
  MPP_PAYMENT_REQUIRED_META_KEY,
  type MppPaymentChallenge,
} from "./types.js";

export type MppMcpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
  _meta?: Record<string, unknown>;
};

export type MppMcpJsonRpcError = {
  code: number;
  message: string;
  data?: Record<string, unknown>;
};

export function buildMppMcpChallenges(input: {
  offers: MppPaymentOffer[];
  resource: string;
  x402Body?: X402PaymentRequired;
}): MppPaymentChallenge[] {
  return buildChallengesFromOffers(input);
}

export function buildMppMcpJsonRpcError(input: {
  offers: MppPaymentOffer[];
  resource: string;
  x402Body?: X402PaymentRequired;
}): MppMcpJsonRpcError {
  const challenges = buildMppMcpChallenges(input);
  const body = buildMppPaymentRequiredBody({
    resource: input.resource,
    challenges,
    x402Body: input.x402Body,
  });

  return {
    code: MPP_MCP_PAYMENT_REQUIRED_CODE,
    message: "Payment Required",
    data: {
      payment: body.payment,
      challenges,
      resource: input.resource,
    },
  };
}

export function enrichMcpToolResultWithMpp(
  toolResult: MppMcpToolResult,
  input: {
    offers: MppPaymentOffer[];
    resource: string;
    x402Body?: X402PaymentRequired;
  }
): MppMcpToolResult {
  const challenges = buildMppMcpChallenges(input);
  const mppBody = buildMppPaymentRequiredBody({
    resource: input.resource,
    challenges,
    x402Body: input.x402Body,
  });

  return {
    ...toolResult,
    _meta: {
      ...toolResult._meta,
      [MPP_PAYMENT_REQUIRED_META_KEY]: mppBody,
      [MPP_CREDENTIAL_META_KEY]: MPP_CREDENTIAL_META_KEY,
      "clawql/mpp": {
        challenges,
        jsonRpcError: buildMppMcpJsonRpcError(input),
      },
    },
  };
}

export function readMppCredentialFromMeta(
  meta: Record<string, unknown> | undefined
): string | undefined {
  if (!meta) return undefined;
  const direct = meta[MPP_CREDENTIAL_META_KEY];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  return undefined;
}

export function readMppCredentialFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string | undefined {
  const auth = headers.authorization ?? headers.Authorization;
  if (typeof auth === "string" && /^payment\s+/i.test(auth.trim())) {
    return auth.trim();
  }
  return undefined;
}
