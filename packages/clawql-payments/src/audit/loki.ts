import type { PaymentWormEntry } from "./events.js";

function lokiPushUrl(env: NodeJS.ProcessEnv): string | undefined {
  const u = env.CLAWQL_LOKI_PUSH_URL?.trim();
  return u || undefined;
}

function nsTimestamp(entry: PaymentWormEntry): string {
  const ms = Date.parse(entry.ts);
  const t = Number.isFinite(ms) ? ms : Date.now();
  return String(Math.floor(t * 1e6));
}

/**
 * Push one payment audit entry to Loki. Callers should gate with
 * {@link isPaymentAuditLokiPushEnabled} before invoking.
 */
export function maybePushPaymentAuditEntryToLoki(
  entry: PaymentWormEntry,
  env: NodeJS.ProcessEnv = process.env
): void {
  const url = lokiPushUrl(env);
  if (!url) {
    return;
  }

  const job =
    env.CLAWQL_PAYMENTS_LOKI_JOB?.trim() || env.CLAWQL_LOKI_JOB?.trim() || "clawql-payments-audit";
  const line = JSON.stringify({
    ts: entry.ts,
    category: entry.category,
    action: entry.action,
    summary: entry.summary,
    payload: entry.payload,
    ...(entry.correlationId ? { correlationId: entry.correlationId } : {}),
  });

  const body = JSON.stringify({
    streams: [
      {
        stream: { job, service: "clawql-payments" },
        values: [[nsTimestamp(entry), line]],
      },
    ],
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const token = env.CLAWQL_LOKI_BEARER_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const tenant = env.CLAWQL_LOKI_TENANT_ID?.trim();
  if (tenant) {
    headers["X-Scope-OrgID"] = tenant;
  }

  const timeoutMs = Number.parseInt(env.CLAWQL_LOKI_PUSH_TIMEOUT_MS?.trim() ?? "5000", 10);
  const ms = Number.isFinite(timeoutMs) ? Math.min(Math.max(timeoutMs, 500), 60_000) : 5000;

  void fetch(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(ms),
  })
    .then((res) => {
      if (!res.ok) {
        return res.text().then((t) => {
          throw new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`);
        });
      }
    })
    .catch((err: unknown) => {
      console.error(
        "[clawql-payments-audit-loki] push failed:",
        err instanceof Error ? err.message : err
      );
    });
}
