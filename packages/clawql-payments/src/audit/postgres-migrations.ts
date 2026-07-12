import type { PoolClient } from "pg";

export async function runPaymentsAuditPostgresMigrations(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS clawql_payments_audit (
      seq bigint PRIMARY KEY,
      record jsonb NOT NULL
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS clawql_payments_audit_seq_idx
    ON clawql_payments_audit (seq DESC)
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS clawql_payments_audit_meta (
      id int PRIMARY KEY CHECK (id = 1),
      seq bigint NOT NULL DEFAULT 0,
      last_hash text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}
