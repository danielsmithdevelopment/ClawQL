/**
 * Optional push of MCP `audit.append` rows to Grafana Loki (`/loki/api/v1/push`).
 * Fire-and-forget: failures log to stderr and do not fail the MCP tool.
 *
 * Stream labels stay low-cardinality; category/action/summary live in the JSON line body.
 */

import type { ClawqlAuditEntry } from "./clawql-audit.js";

function lokiPushEnabled(): boolean {
  const flag = process.env.CLAWQL_ENABLE_LOKI_PUSH?.trim();
  if (flag === "0" || flag?.toLowerCase() === "false") {
    return false;
  }
  return Boolean(lokiPushUrl());
}

function lokiPushUrl(): string | undefined {
  const u = process.env.CLAWQL_LOKI_PUSH_URL?.trim();
  return u || undefined;
}

function nsTimestamp(entry: ClawqlAuditEntry): string {
  const ms = Date.parse(entry.ts);
  const t = Number.isFinite(ms) ? ms : Date.now();
  return String(Math.floor(t * 1e6));
}

/**
 * Push one audit entry to Loki when **`CLAWQL_LOKI_PUSH_URL`** is set and
 * **`CLAWQL_ENABLE_LOKI_PUSH`** is not **`0`** (default on when URL is set).
 *
 * **Auth:** optional **`CLAWQL_LOKI_BEARER_TOKEN`** (Authorization: Bearer).
 * **Multi-tenant Loki:** optional **`CLAWQL_LOKI_TENANT_ID`** → `X-Scope-OrgID`.
 * **Labels:** `job` from **`CLAWQL_LOKI_JOB`** (default **`clawql-audit`**), plus **`service="clawql-mcp"`**.
 */
export function maybePushAuditEntryToLoki(entry: ClawqlAuditEntry): void {
  if (!lokiPushEnabled()) {
    return;
  }

  const url = lokiPushUrl();
  if (!url) {
    return;
  }

  const job = process.env.CLAWQL_LOKI_JOB?.trim() || "clawql-audit";
  const line = JSON.stringify({
    ts: entry.ts,
    category: entry.category,
    action: entry.action,
    summary: entry.summary,
    ...(entry.correlationId ? { correlationId: entry.correlationId } : {}),
  });

  const body = JSON.stringify({
    streams: [
      {
        stream: { job, service: "clawql-mcp" },
        values: [[nsTimestamp(entry), line]],
      },
    ],
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const token = process.env.CLAWQL_LOKI_BEARER_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const tenant = process.env.CLAWQL_LOKI_TENANT_ID?.trim();
  if (tenant) {
    headers["X-Scope-OrgID"] = tenant;
  }

  const timeoutMs = Number.parseInt(process.env.CLAWQL_LOKI_PUSH_TIMEOUT_MS?.trim() ?? "5000", 10);
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
      console.error("[clawql-audit-loki] push failed:", err instanceof Error ? err.message : err);
    });
}
