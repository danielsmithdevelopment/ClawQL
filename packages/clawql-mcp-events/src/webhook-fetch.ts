import { Effect } from "effect";
import { CallbackEndpointError } from "./errors.js";
import {
  assertSafeCallbackUrl,
  readCallbackUrlPolicy,
  type CallbackUrlPolicy,
} from "./callback-url.js";

export type WebhookFetch = (
  url: string,
  init: RequestInit & { redirect?: RequestRedirect }
) => Promise<Response>;

/**
 * SSRF-hardened webhook fetch: re-validates URL, forces redirect: "error",
 * default 10s timeout. Inject `fetch` for tests.
 */
export function makeWebhookFetch(
  fetchFn: typeof fetch = fetch,
  policy?: CallbackUrlPolicy
): WebhookFetch {
  return async (url, init) => {
    const pol = policy ?? (await Effect.runPromise(readCallbackUrlPolicy()));
    await Effect.runPromise(assertSafeCallbackUrl(url, pol));
    const signal = init.signal ?? AbortSignal.timeout(10_000);
    // codeql[js/request-forgery]: URL validated by assertSafeCallbackUrl (HTTPS + public hosts).
    return fetchFn(url, { ...init, redirect: "error", signal });
  };
}

export function webhookPostJson(
  webhookFetch: WebhookFetch,
  url: string,
  headers: Record<string, string>,
  body: string
): Effect.Effect<{ ok: boolean; status: number; text: string }, CallbackEndpointError> {
  return Effect.tryPromise({
    try: async () => {
      const response = await webhookFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body,
        redirect: "error",
      });
      const text = await response.text();
      return { ok: response.ok, status: response.status, text };
    },
    catch: (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      const reason = /abort|timeout/i.test(msg) ? "timeout" : "challenge_failed";
      return new CallbackEndpointError({ message: msg, reason });
    },
  });
}
