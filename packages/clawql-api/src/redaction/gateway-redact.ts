/**
 * Gateway text redaction chain: Presidio (optional) → Privacy Filter (optional local backup).
 * Each layer is independently default-off; enabling one does not require the other.
 */

import { maybePresidioRedactText, presidioEnabled } from "../presidio/client.js";
import { maybePrivacyFilterRedactText, privacyFilterEnabled } from "../privacy-filter/client.js";
import { Effect } from "effect";

/** True when any gateway redaction layer is enabled. */
export function gatewayRedactionEnabled(): boolean {
  return presidioEnabled() || privacyFilterEnabled();
}

/**
 * Apply enabled layers in order: Presidio first, then local Privacy Filter as backup
 * for spans Presidio missed.
 */
async function maybeGatewayRedactTextImpl(text: string): Promise<string>  {
  let out = text;
  if (presidioEnabled()) {
    out = await maybePresidioRedactText(out);
  }
  if (privacyFilterEnabled()) {
    out = await maybePrivacyFilterRedactText(out);
  }
  return out;
}

export function maybeGatewayRedactTextEffect(text: string): Effect.Effect<string, Error> {
  return Effect.tryPromise({
    try: () => maybeGatewayRedactTextImpl(text),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link maybeGatewayRedactTextEffect} for Effect callers. */
export async function maybeGatewayRedactText(text: string): Promise<string>  {
  return Effect.runPromise(maybeGatewayRedactTextEffect(text));
}

/**
 * Redact string fields in a JSON-like tool payload (shallow + nested).
 */
async function gatewayRedactPayloadImpl(value: unknown): Promise<unknown>  {
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

export function gatewayRedactPayloadEffect(value: unknown): Effect.Effect<unknown, Error> {
  return Effect.tryPromise({
    try: () => gatewayRedactPayloadImpl(value),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link gatewayRedactPayloadEffect} for Effect callers. */
export async function gatewayRedactPayload(value: unknown): Promise<unknown>  {
  return Effect.runPromise(gatewayRedactPayloadEffect(value));
}
