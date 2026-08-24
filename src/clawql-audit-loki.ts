/**
 * Optional push of MCP `audit.append` rows to Grafana Loki (`/loki/api/v1/push`).
 * Fire-and-forget: failures log to stderr and do not fail the MCP tool.
 *
 * Stream labels stay low-cardinality; category/action/summary live in the JSON line body.
 */

import { forkPushLokiLogLine, type LokiLogLine } from "clawql-core";
import type { ClawqlAuditEntry } from "./clawql-audit.js";

function auditLokiLine(entry: ClawqlAuditEntry, env: NodeJS.ProcessEnv): LokiLogLine {
  const job = env.CLAWQL_LOKI_JOB?.trim() || "clawql-audit";
  return {
    job,
    service: "clawql-mcp",
    ts: entry.ts,
    line: JSON.stringify({
      ts: entry.ts,
      category: entry.category,
      action: entry.action,
      summary: entry.summary,
      ...(entry.correlationId ? { correlationId: entry.correlationId } : {}),
    }),
  };
}

/**
 * Push one audit entry to Loki when **`CLAWQL_LOKI_PUSH_URL`** is set and
 * **`CLAWQL_ENABLE_LOKI_PUSH`** is not **`0`** (default on when URL is set).
 *
 * **Auth:** optional **`CLAWQL_LOKI_BEARER_TOKEN`** (Authorization: Bearer).
 * **Multi-tenant Loki:** optional **`CLAWQL_LOKI_TENANT_ID`** → `X-Scope-OrgID`.
 * **Labels:** `job` from **`CLAWQL_LOKI_JOB`** (default **`clawql-audit`**), plus **`service="clawql-mcp"`**.
 */
export function maybePushAuditEntryToLoki(
  entry: ClawqlAuditEntry,
  env: NodeJS.ProcessEnv = process.env
): void {
  forkPushLokiLogLine(auditLokiLine(entry, env), env, "[clawql-audit-loki]");
}
