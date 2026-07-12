import type pg from "pg";
import { describe, expect, it, beforeEach } from "vitest";
import { PAYMENT_AUDIT_GENESIS_HASH } from "./chain.js";
import { buildStripeInvoicePaidEntry } from "./events.js";
import { PostgresPaymentAuditStore } from "./postgres-store.js";

type AuditRow = {
  seq: number;
  record: unknown;
};

type MetaRow = {
  seq: number;
  last_hash: string;
  updated_at: string;
};

function createMockPool(): pg.Pool {
  const records: AuditRow[] = [];
  let meta: MetaRow | null = null;

  const client = {
    async query(sql: string, params: unknown[] = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();

      if (normalized === "BEGIN" || normalized === "COMMIT" || normalized === "ROLLBACK") {
        return { rows: [] };
      }

      if (normalized.startsWith("CREATE TABLE") || normalized.startsWith("CREATE INDEX")) {
        return { rows: [] };
      }

      if (normalized.includes("FROM clawql_payments_audit_meta WHERE id = 1")) {
        return { rows: meta ? [{ seq: String(meta.seq), last_hash: meta.last_hash }] : [] };
      }

      if (
        normalized.includes(
          "SELECT seq, record FROM clawql_payments_audit ORDER BY seq DESC LIMIT 1"
        )
      ) {
        const last = records[records.length - 1];
        return {
          rows: last ? [{ seq: String(last.seq), record: last.record }] : [],
        };
      }

      if (normalized.startsWith("INSERT INTO clawql_payments_audit (seq, record)")) {
        const record = JSON.parse(String(params[1]));
        records.push({ seq: Number(params[0]), record });
        return { rows: [] };
      }

      if (normalized.startsWith("INSERT INTO clawql_payments_audit_meta")) {
        meta = {
          seq: Number(params[0]),
          last_hash: String(params[1]),
          updated_at: String(params[2]),
        };
        return { rows: [] };
      }

      if (normalized.includes("ORDER BY seq DESC LIMIT")) {
        const limit = Number(params[0]);
        const slice = records.slice(-limit).reverse();
        return { rows: slice.map((row) => ({ record: row.record })) };
      }

      if (normalized.includes("ORDER BY seq ASC")) {
        return { rows: records.map((row) => ({ record: row.record })) };
      }

      if (normalized.startsWith("DELETE FROM clawql_payments_audit")) {
        records.length = 0;
        return { rows: [] };
      }

      if (normalized.startsWith("DELETE FROM clawql_payments_audit_meta")) {
        meta = null;
        return { rows: [] };
      }

      throw new Error(`Unhandled mock query: ${normalized}`);
    },
    release() {},
  };

  return {
    connect: async () => client,
    query: client.query.bind(client),
    end: async () => {},
  } as unknown as pg.Pool;
}

describe("PostgresPaymentAuditStore", () => {
  let pool: pg.Pool;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    pool = createMockPool();
    env = { NODE_ENV: "test", CLAWQL_PAYMENTS_AUDIT_STORE: "postgres" };
  });

  it("appends hash-chained records and verifies chain", async () => {
    const store = new PostgresPaymentAuditStore(pool, env);

    await store.append(buildStripeInvoicePaidEntry({ tenantId: "t1", amountUsd: 10 }));
    await store.append(buildStripeInvoicePaidEntry({ tenantId: "t2", amountUsd: 20 }));

    const entries = await store.list(10);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.payload.tenant_id).toBe("t1");

    const result = await store.verify();
    expect(result.ok).toBe(true);
    expect(result.records).toBe(2);
    expect(result.head_hash).not.toBe(PAYMENT_AUDIT_GENESIS_HASH);
  });

  it("reset clears records", async () => {
    const store = new PostgresPaymentAuditStore(pool, env);
    await store.append(buildStripeInvoicePaidEntry({ tenantId: "t1", amountUsd: 1 }));
    await store.reset();
    const entries = await store.list(10);
    expect(entries).toHaveLength(0);
  });
});
