import { parseX402PaymentPayloadHeader, readX402PaymentHeader } from "../x402/headers.js";
import type { X402PaymentPayloadV2 } from "../x402/types.js";
import { MPP_METHOD_X402 } from "./types.js";

export type MppCredentialChallenge = {
  id: string;
  intent?: string;
  method: string;
  realm?: string;
  request?: string;
  opaque?: string;
  expires?: string;
};

/** Canonical MPP credential (Authorization: Payment base64url JSON). */
export type MppCredential = {
  challenge: MppCredentialChallenge;
  source?: string;
  payload: Record<string, unknown>;
};

export type ParsedPaymentCredential =
  | { kind: "mpp"; credential: MppCredential; raw: string }
  | { kind: "x402-signature"; headerValue: string; payload: X402PaymentPayloadV2 };

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${pad}`, "base64").toString("utf8");
}

function tryParseJsonObject(raw: string): Record<string, unknown> | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  try {
    const decoded = decodeBase64Url(trimmed);
    const parsed = JSON.parse(decoded) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function isMppCredentialObject(value: Record<string, unknown>): value is MppCredential {
  const challenge = value.challenge;
  if (typeof challenge !== "object" || challenge === null || Array.isArray(challenge)) {
    return false;
  }
  const id = (challenge as Record<string, unknown>).id;
  const method = (challenge as Record<string, unknown>).method;
  return typeof id === "string" && id.trim().length > 0 && typeof method === "string";
}

export function parseMppCredentialRaw(raw: string): MppCredential | undefined {
  const parsed = tryParseJsonObject(raw);
  if (!parsed || !isMppCredentialObject(parsed)) return undefined;
  const payload = parsed.payload;
  return {
    challenge: parsed.challenge,
    source: typeof parsed.source === "string" ? parsed.source : undefined,
    payload:
      typeof payload === "object" && payload !== null && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {},
  };
}

export function parseAuthorizationPaymentHeader(
  headerValue: string | undefined
): MppCredential | undefined {
  if (!headerValue?.trim()) return undefined;
  const trimmed = headerValue.trim();
  const token = trimmed.replace(/^payment\s+/i, "").trim();
  if (!token) return undefined;
  return parseMppCredentialRaw(token);
}

export function extractPaymentCredential(
  headers: Record<string, string | string[] | undefined>
): ParsedPaymentCredential | undefined {
  const auth = headers.authorization ?? headers.Authorization;
  if (typeof auth === "string" && /^payment\s+/i.test(auth.trim())) {
    const credential = parseAuthorizationPaymentHeader(auth);
    if (credential) {
      return { kind: "mpp", credential, raw: auth.trim() };
    }
  }

  const x402Header = readX402PaymentHeader(headers);
  if (x402Header) {
    const payload = parseX402PaymentPayloadHeader(x402Header);
    if (payload) {
      return { kind: "x402-signature", headerValue: x402Header, payload };
    }
  }

  return undefined;
}

export function x402PayloadFromMppCredential(
  credential: MppCredential
): X402PaymentPayloadV2 | undefined {
  const payload = credential.payload;
  if (payload.x402Version !== undefined || payload.accepted !== undefined) {
    return {
      x402Version: typeof payload.x402Version === "number" ? payload.x402Version : 2,
      resource:
        typeof payload.resource === "object" && payload.resource !== null
          ? (payload.resource as X402PaymentPayloadV2["resource"])
          : undefined,
      accepted:
        typeof payload.accepted === "object" && payload.accepted !== null
          ? (payload.accepted as X402PaymentPayloadV2["accepted"])
          : undefined,
      payload:
        typeof payload.payload === "object" && payload.payload !== null
          ? (payload.payload as Record<string, unknown>)
          : payload,
    };
  }

  if (credential.challenge.method === MPP_METHOD_X402) {
    return {
      x402Version: 2,
      payload,
    };
  }

  return undefined;
}

export function decodeChallengeRequest(
  request: string | undefined
): Record<string, unknown> | undefined {
  if (!request?.trim()) return undefined;
  return tryParseJsonObject(request) ?? tryParseJsonObject(decodeBase64Url(request.trim()));
}
