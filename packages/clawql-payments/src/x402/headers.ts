import type { X402PaymentPayloadV2 } from "./types.js";
import { X402_VERSION } from "./types.js";

const PAYMENT_HEADER_NAMES = [
  "x-payment",
  "payment-signature",
  "x402-payment",
  "payment-signature",
] as const;

export function readX402PaymentHeader(
  headers: Record<string, string | string[] | undefined>
): string | undefined {
  for (const name of PAYMENT_HEADER_NAMES) {
    const direct = headers[name];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const canonical = headers[name.toUpperCase()];
    if (typeof canonical === "string" && canonical.trim()) return canonical.trim();
  }
  return undefined;
}

function decodeHeaderValue(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;
  try {
    return Buffer.from(trimmed, "base64").toString("utf8");
  } catch {
    return trimmed;
  }
}

export function parseX402PaymentPayloadHeader(
  headerValue: string | undefined
): X402PaymentPayloadV2 | undefined {
  if (!headerValue?.trim()) return undefined;
  const decoded = decodeHeaderValue(headerValue);
  try {
    const parsed = JSON.parse(decoded) as X402PaymentPayloadV2;
    if (typeof parsed !== "object" || parsed === null) return undefined;
    return {
      x402Version: parsed.x402Version ?? X402_VERSION,
      resource: parsed.resource,
      accepted: parsed.accepted,
      payload: parsed.payload,
    };
  } catch {
    return undefined;
  }
}
