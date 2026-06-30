/**
 * Postgres-backed Ouroboros event store (#142). Skips unless CLAWQL_OUROBOROS_DATABASE_URL is set (local CI / dev).
 */

import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { PostgresOuroborosEventStore } from "./postgres-event-store.js";
import { closeOuroborosPgPool, getOuroborosPgPool } from "./postgres-pool.js";

const hasOuroborosPg = Boolean(process.env.CLAWQL_OUROBOROS_DATABASE_URL?.trim());

describe.skipIf(!hasOuroborosPg)(
  "PostgresOuroborosEventStore (CLAWQL_OUROBOROS_DATABASE_URL)",
  () => {
    afterEach(async () => {
      await closeOuroborosPgPool();
    });

    it("append and getLineage round-trip", async () => {
      const pool = getOuroborosPgPool();
      if (!pool) throw new Error("expected pool when CLAWQL_OUROBOROS_DATABASE_URL is set");
      const store = new PostgresOuroborosEventStore(pool);
      const seedId = `vitest-ouroboros-${randomUUID()}`;

      await store.append({
        type: "generation_completed",
        seed_id: seedId,
        data: {
          generation_number: 1,
          seed: { goal: "integration goal" } as never,
          execution_output: "ok",
          evaluation_summary: {
            final_approved: true,
            score: 0.9,
            ac_results: [{ ac_index: 0, ac_content: "c", passed: true, evidence: "" }],
          },
          phase: "completed",
          ontology_schema: { name: "o", description: "d", fields: [] },
        },
      });
      await store.append({
        type: "ouroboros_finished",
        seed_id: seedId,
        data: { converged: true, generation_count: 1 },
      });

      const lin = await store.getLineage(seedId);
      expect(lin.seed_id).toBe(seedId);
      expect(lin.status).toBe("converged");
      expect(lin.generations).toHaveLength(1);
      expect(lin.current_generation).toBe(1);

      await pool.query(`DELETE FROM clawql_ouroboros_events WHERE root_seed_id = $1`, [seedId]);
    });

    it("getLineage returns active empty lineage for unknown seed", async () => {
      const pool = getOuroborosPgPool();
      if (!pool) throw new Error("expected pool when CLAWQL_OUROBOROS_DATABASE_URL is set");
      const store = new PostgresOuroborosEventStore(pool);
      const unknownId = `vitest-ouroboros-missing-${randomUUID()}`;
      const lin = await store.getLineage(unknownId);
      expect(lin.seed_id).toBe(unknownId);
      expect(lin.generations).toHaveLength(0);
      expect(lin.status).toBe("active");
      expect(lin.current_generation).toBe(0);
    });
  }
);
