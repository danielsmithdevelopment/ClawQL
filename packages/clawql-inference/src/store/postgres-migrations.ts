import type { PoolClient } from "pg";

export async function runInferencePostgresMigrations(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS clawql_inference_calls (
      id text PRIMARY KEY,
      correlation_id text,
      record jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS clawql_inference_calls_correlation_idx
    ON clawql_inference_calls (correlation_id)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS clawql_inference_calls_created_idx
    ON clawql_inference_calls (created_at DESC)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS clawql_inference_calls_model_idx
    ON clawql_inference_calls ((record->>'modelId'))
  `);
}
