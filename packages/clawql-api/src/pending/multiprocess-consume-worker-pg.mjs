/**
 * Child process: Postgres consume race using the same UPDATE…WHERE as production.
 */
import pg from "pg";

const url = process.env.CLAWQL_PENDING_DATABASE_URL;
const eid = process.env.CONSUME_EID;
const hash = process.env.CONSUME_HASH;
const by = process.env.CONSUME_BY ?? `pid:${process.pid}`;
const attempts = Number(process.env.CONSUME_ATTEMPTS ?? "25");

const CONSUME_SQL = `
UPDATE pending_executions
SET status = 'outcome_unknown',
    consumed_at = NOW(),
    consumed_by = $1,
    last_error = NULL,
    updated_at = NOW()
WHERE execution_id = $2
  AND status = 'approved'
  AND args_hash = $3
  AND expires_at > NOW()
RETURNING execution_id, payload_json, consumed_at, consumed_by
`.trim();

let wins = 0;
let losses = 0;

const pool = new pg.Pool({ connectionString: url, max: 2 });

for (let i = 0; i < attempts; i++) {
  const client = await pool.connect();
  const consumedBy = `${by}-${i}`;
  try {
    await client.query("BEGIN");
    const r = await client.query(CONSUME_SQL, [consumedBy, eid, hash]);
    if (r.rowCount === 1) {
      const row = r.rows[0];
      const payload = typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json;
      payload.status = "outcome_unknown";
      payload.consumedAt = new Date(row.consumed_at).toISOString();
      payload.consumedBy = row.consumed_by;
      payload.lastError = null;
      await client.query(`UPDATE pending_executions SET payload_json = $1::jsonb WHERE execution_id = $2`, [
        JSON.stringify(payload),
        eid,
      ]);
      await client.query("COMMIT");
      wins += 1;
    } else {
      await client.query("ROLLBACK");
      losses += 1;
    }
  } catch {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    losses += 1;
  } finally {
    client.release();
  }
}

await pool.end();
if (process.send) {
  process.send({ wins, losses, label: by });
}
process.exit(0);
