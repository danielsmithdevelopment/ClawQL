import type pg from "pg";
import type { InferenceListQuery, InferenceRecord, InferenceStore, SpendRow } from "./types.js";
import { InMemoryInferenceStore } from "./in-memory.js";
import { ensureInferenceSchema } from "./postgres-pool.js";

function hydrateRecord(raw: unknown): InferenceRecord {
  return raw as InferenceRecord;
}

export class PostgresInferenceStore implements InferenceStore {
  constructor(
    private readonly pool: pg.Pool,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  async append(record: InferenceRecord): Promise<void> {
    await ensureInferenceSchema(this.env);
    await this.pool.query(
      `INSERT INTO clawql_inference_calls (id, correlation_id, record, created_at)
       VALUES ($1, $2, $3::jsonb, $4)`,
      [record.id, record.correlationId ?? null, JSON.stringify(record), record.timestamp]
    );
  }

  private async loadAll(): Promise<InferenceRecord[]> {
    await ensureInferenceSchema(this.env);
    const res = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM clawql_inference_calls ORDER BY created_at ASC`
    );
    return res.rows.map((row) => hydrateRecord(row.record));
  }

  async list(query: InferenceListQuery = {}): Promise<InferenceRecord[]> {
    const memory = new InMemoryInferenceStore();
    for (const record of await this.loadAll()) {
      await memory.append(record);
    }
    return memory.list(query);
  }

  async getByCorrelationId(correlationId: string): Promise<InferenceRecord[]> {
    await ensureInferenceSchema(this.env);
    const res = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM clawql_inference_calls
       WHERE correlation_id = $1
       ORDER BY created_at ASC`,
      [correlationId]
    );
    return res.rows.map((row) => hydrateRecord(row.record));
  }

  async spendRollup(
    options: {
      since?: Date;
      groupBy?: import("./types.js").SpendGroupBy;
    } = {}
  ): Promise<SpendRow[]> {
    const memory = new InMemoryInferenceStore();
    for (const record of await this.loadAll()) {
      await memory.append(record);
    }
    return memory.spendRollup(options);
  }
}
