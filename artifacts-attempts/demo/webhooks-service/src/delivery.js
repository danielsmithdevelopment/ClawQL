/**
 * Webhook delivery with a deliberate retry-storm bug.
 *
 * Bug: on HTTP 429 / 5xx, the client retries immediately without backoff and
 * without respecting Retry-After, which amplifies load (retry storm).
 *
 * The fix (attempted by agents) should add exponential backoff + Retry-After.
 */

/**
 * @param {string} url
 * @param {object} payload
 * @param {{ fetch?: typeof fetch; maxAttempts?: number; sleep?: (ms: number) => Promise<void> }} [opts]
 */
export async function deliverWebhook(url, payload, opts = {}) {
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const maxAttempts = opts.maxAttempts ?? 5;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      return { ok: true, attempts: attempt, status: res.status };
    }
    lastError = new Error(`webhook failed: ${res.status}`);
    // BUG: no backoff — immediate retry even on 429 with Retry-After.
    // Fixed code should:
    //   const retryAfter = Number(res.headers.get("retry-after"));
    //   const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : Math.min(1000 * 2 ** (attempt - 1), 8000);
    //   await sleep(delay);
    void sleep;
    void res;
  }
  return { ok: false, attempts: maxAttempts, error: lastError?.message ?? "unknown" };
}

/** Allowlist used by the policy check in the evaluator demo. */
export const EGRESS_ALLOWLIST = ["https://hooks.example.com", "https://api.partner.test"];
