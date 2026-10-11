/**
 * Child process for multi-process consume race.
 * Uses the same SQL predicate as pending-execution-sqlite.ts (shared store).
 */
import { DatabaseSync } from "node:sqlite";

const dbPath = process.env.CONSUME_DB;
const eid = process.env.CONSUME_EID;
const hash = process.env.CONSUME_HASH;
const by = process.env.CONSUME_BY ?? `pid:${process.pid}`;
const attempts = Number(process.env.CONSUME_ATTEMPTS ?? "25");

const CONSUME_SQL = `
UPDATE pending_executions
SET status = 'outcome_unknown',
    consumed_at = ?,
    consumed_by = ?,
    last_error = NULL,
    updated_at = ?
WHERE execution_id = ?
  AND status = 'approved'
  AND args_hash = ?
  AND expires_at_ms > ?
RETURNING execution_id
`.trim();

let wins = 0;
let losses = 0;

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA busy_timeout = 5000");

for (let i = 0; i < attempts; i++) {
  const nowMs = Date.now();
  const consumedAt = new Date(nowMs).toISOString();
  const consumedBy = `${by}-${i}`;
  db.exec("BEGIN IMMEDIATE");
  try {
    const hit = db.prepare(CONSUME_SQL).get(
      consumedAt,
      consumedBy,
      consumedAt,
      eid,
      hash,
      nowMs
    );
    if (hit) {
      const row = db
        .prepare(`SELECT payload_json FROM pending_executions WHERE execution_id = ?`)
        .get(eid);
      const payload = JSON.parse(row.payload_json);
      payload.status = "outcome_unknown";
      payload.consumedAt = consumedAt;
      payload.consumedBy = consumedBy;
      payload.lastError = null;
      db.prepare(
        `UPDATE pending_executions SET payload_json = ?, updated_at = ? WHERE execution_id = ?`
      ).run(JSON.stringify(payload), consumedAt, eid);
      db.exec("COMMIT");
      wins += 1;
    } else {
      db.exec("ROLLBACK");
      losses += 1;
    }
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    losses += 1;
  }
}

db.close();
if (process.send) {
  process.send({ wins, losses, label: by });
}
process.exit(0);
