import { Effect } from "effect";

import { ObservabilityError } from "./errors.js";

/** Minimal Faro exception shape for fingerprinting (Phase 2 Worker proxy). */
export interface FaroExceptionFrame {
  readonly function?: string;
  readonly filename?: string;
}

export interface FaroExceptionPayload {
  readonly type?: string;
  readonly value?: string;
  readonly stacktrace?: { readonly frames?: readonly FaroExceptionFrame[] };
}

export interface FaroExceptionEvent {
  readonly payload?: {
    readonly exceptions?: readonly FaroExceptionPayload[];
  };
}

export const normaliseErrorMessage = (message: string): string =>
  message
    .replace(/\b[0-9a-f]{8,}\b/gi, "<hash>")
    .replace(/\b\d+\b/g, "<n>")
    .replace(/https?:\/\/\S+/g, "<url>");

export const createErrorFingerprintEffect = (
  event: FaroExceptionEvent
): Effect.Effect<string, ObservabilityError> =>
  Effect.tryPromise({
    try: async () => {
      const err = event.payload?.exceptions?.[0];
      const topFrame = err?.stacktrace?.frames?.at(-1);
      const raw = [
        err?.type ?? "UnknownError",
        normaliseErrorMessage(err?.value ?? ""),
        topFrame?.function ?? "",
        topFrame?.filename ?? "",
      ].join("|");

      const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
      return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 16);
    },
    catch: (cause) => new ObservabilityError({ reason: "fingerprint_digest_failed", cause }),
  });

/** Node / Worker façade — uses Web Crypto when available. */
export const createErrorFingerprint = (event: FaroExceptionEvent): Promise<string> =>
  Effect.runPromise(createErrorFingerprintEffect(event));
