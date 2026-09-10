import { ensureSchema } from "./tenants.js";

export type AuditAppendInput = {
  correlationId: string;
  tenantId: string;
  eventKind: string;
  summary?: string;
  model?: string | null;
  payload?: Record<string, unknown>;
};

export async function appendAudit(db: D1Database, input: AuditAppendInput): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(
      `INSERT INTO audit_log (correlation_id, tenant_id, event_kind, summary, model, created_at, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.correlationId,
      input.tenantId,
      input.eventKind,
      input.summary ?? null,
      input.model ?? null,
      new Date().toISOString(),
      input.payload ? JSON.stringify(input.payload) : null
    )
    .run();
}

export async function listAudit(
  db: D1Database,
  tenantId: string,
  limit = 20
): Promise<
  Array<{
    id: number;
    correlation_id: string;
    event_kind: string;
    summary: string | null;
    created_at: string;
  }>
> {
  await ensureSchema(db);
  const res = await db
    .prepare(
      `SELECT id, correlation_id, event_kind, summary, created_at
       FROM audit_log WHERE tenant_id = ? ORDER BY id DESC LIMIT ?`
    )
    .bind(tenantId, Math.min(Math.max(limit, 1), 100))
    .all();
  return (res.results ?? []) as Array<{
    id: number;
    correlation_id: string;
    event_kind: string;
    summary: string | null;
    created_at: string;
  }>;
}
