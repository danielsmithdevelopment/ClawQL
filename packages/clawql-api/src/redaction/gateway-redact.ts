/**
 * Gateway text redaction chain: Presidio (optional) → Privacy Filter (optional local backup).
 * Each layer is independently default-off; enabling one does not require the other.
 */

import { maybePresidioRedactText, presidioEnabled } from "../presidio/client.js";
import { maybePrivacyFilterRedactText, privacyFilterEnabled } from "../privacy-filter/client.js";

/** True when any gateway redaction layer is enabled. */
export function gatewayRedactionEnabled(): boolean {
  return presidioEnabled() || privacyFilterEnabled();
}

/**
 * Apply enabled layers in order: Presidio first, then local Privacy Filter as backup
 * for spans Presidio missed.
 */
export async function maybeGatewayRedactText(text: string): Promise<string> {
  let out = text;
  if (presidioEnabled()) {
    out = await maybePresidioRedactText(out);
  }
  if (privacyFilterEnabled()) {
    out = await maybePrivacyFilterRedactText(out);
  }
  return out;
}

/**
 * Redact string fields in a JSON-like tool payload (shallow + nested).
 */
export async function gatewayRedactPayload(value: unknown): Promise<unknown> {
  if (typeof value === "string") {
    return maybeGatewayRedactText(value);
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((v) => gatewayRedactPayload(v)));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = await gatewayRedactPayload(v);
    }
    return out;
  }
  return value;
}
