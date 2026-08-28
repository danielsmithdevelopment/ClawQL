/**
 * Lightweight payload validation for Faro ingest.
 * Reject oversized / malformed shapes before they reach Alloy.
 */

const ALLOWED_EVENT_TYPES = new Set(["exception", "measurement", "event", "log", "trace"]);

export type SchemaResult =
  { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly reason: string };

export const validatePayload = (body: unknown, maxBytes: number, rawSize: number): SchemaResult => {
  if (rawSize > maxBytes) {
    return { ok: false, reason: "payload_too_large" };
  }

  if (body === null || typeof body !== "object") {
    return { ok: false, reason: "invalid_json" };
  }

  const events = Array.isArray(body)
    ? body
    : Array.isArray((body as { events?: unknown }).events)
      ? (body as { events: unknown[] }).events
      : [body];

  if (events.length === 0 || events.length > 50) {
    return { ok: false, reason: "bad_batch_size" };
  }

  for (const event of events) {
    if (event === null || typeof event !== "object") {
      return { ok: false, reason: "invalid_event" };
    }
    const type = (event as { type?: unknown }).type;
    if (typeof type !== "string" || !ALLOWED_EVENT_TYPES.has(type)) {
      return { ok: false, reason: "unexpected_event_type" };
    }
  }

  return { ok: true, value: body };
};
