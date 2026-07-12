import type pg from "pg";
import {
  PAYMENT_AUDIT_GENESIS_HASH,
  sealPaymentWormRecord,
  toPaymentWormEntry,
  verifyPaymentAuditChain,
  type PaymentAuditVerifyResult,
  type PaymentWormRecord,
} from "./chain.js";
import type { PaymentWormEntry } from "./events.js";
import { runPaymentsAuditPostgresMigrations } from "./postgres-migrations.js";
import { getPaymentsAuditPgPool, registerPaymentsAuditPoolShutdownHooks } from "./postgres-pool.js";
import type { PaymentAuditStore } from "./store.js";

type ChainHead = {
  seq: number;
  last_hash: string;
};

function hydrateRecord(raw: unknown): PaymentWormRecord {
  return raw as PaymentWormRecord;
}

async function readChainHead(client: pg.PoolClient): Promise<ChainHead> {
  const meta = await client.query<{ seq: string; last_hash: string }>(
    `SELECT seq, last_hash FROM clawql_payments_audit_meta WHERE id = 1`
  );
  if (meta.rows.length > 0) {
    return {
      seq: Number(meta.rows[0]!.seq),
      last_hash: meta.rows[0]!.last_hash,
    };
  }

  const last = await client.query<{ seq: string; record: unknown }>(
    `SELECT seq, record FROM clawql_payments_audit ORDER BY seq DESC LIMIT 1`
  );
  if (last.rows.length === 0) {
    return { seq: 0, last_hash: PAYMENT_AUDIT_GENESIS_HASH };
  }
  const record = hydrateRecord(last.rows[0]!.record);
  return { seq: Number(last.rows[0]!.seq), last_hash: record.hash };
}

async function writeChainHead(
  client: pg.PoolClient,
  head: ChainHead & { updated_at: string }
): Promise<void> {
  await client.query(
    `INSERT INTO clawql_payments_audit_meta (id, seq, last_hash, updated_at)
     VALUES (1, $1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET
       seq = EXCLUDED.seq,
       last_hash = EXCLUDED.last_hash,
       updated_at = EXCLUDED.updated_at`,
    [head.seq, head.last_hash, head.updated_at]
  );
}

export class PostgresPaymentAuditStore implements PaymentAuditStore {
  private migrationsDone = false;

  constructor(
    private readonly pool: pg.Pool,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  private async ensureSchema(): Promise<void> {
    if (this.migrationsDone) return;
    const client = await this.pool.connect();
    try {
      await runPaymentsAuditPostgresMigrations(client);
      this.migrationsDone = true;
    } finally {
      client.release();
    }
  }

  async append(entry: PaymentWormEntry): Promise<PaymentWormRecord> {
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const head = await readChainHead(client);
      const record = sealPaymentWormRecord({
        entry,
        seq: head.seq + 1,
        prev_hash: head.last_hash,
      });
      await client.query(`INSERT INTO clawql_payments_audit (seq, record) VALUES ($1, $2::jsonb)`, [
        record.seq,
        JSON.stringify(record),
      ]);
      await writeChainHead(client, {
        seq: record.seq,
        last_hash: record.hash,
        updated_at: new Date().toISOString(),
      });
      await client.query("COMMIT");
      return record;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async list(limit = 100): Promise<PaymentWormEntry[]> {
    return (await this.listRecords(limit)).map(toPaymentWormEntry);
  }

  async listRecords(limit = 100): Promise<PaymentWormRecord[]> {
    await this.ensureSchema();
    if (limit <= 0) return [];
    const res = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM clawql_payments_audit ORDER BY seq DESC LIMIT $1`,
      [limit]
    );
    return res.rows.map((row) => hydrateRecord(row.record)).reverse();
  }

  async verify(): Promise<PaymentAuditVerifyResult> {
    await this.ensureSchema();
    const res = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM clawql_payments_audit ORDER BY seq ASC`
    );
    const records = res.rows.map((row) => hydrateRecord(row.record));
    return verifyPaymentAuditChain(records);
  }

  async reset(): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(`DELETE FROM clawql_payments_audit`);
    await this.pool.query(`DELETE FROM clawql_payments_audit_meta`);
  }
}

export function createPostgresPaymentAuditStore(
  env: NodeJS.ProcessEnv = process.env
): PostgresPaymentAuditStore | null {
  const pool = getPaymentsAuditPgPool(env);
  if (!pool) return null;
  registerPaymentsAuditPoolShutdownHooks();
  return new PostgresPaymentAuditStore(pool, env);
}
