/**
 * Delete ontology.db rows that point at a vault note path (erasure).
 * Domain API is Effect-primary; Promise façade for erase orchestration.
 */

import { Effect } from "effect";
import { withOntologyWriteLock, openOntologyDb } from "./ontology-db.js";

const TABLES_WITH_VAULT_PATH = [
  "matters",
  "clients",
  "attorneys",
  "documents",
  "dynamic_records",
] as const;

/**
 * Remove typed / dynamic ontology rows keyed by `vault_note_path`.
 * Best-effort when ontology.db is disabled or missing.
 */
export function deleteOntologyRowsByVaultNotePathEffect(
  vaultRoot: string,
  vaultNotePath: string
): Effect.Effect<{ deleted: number }, Error> {
  return Effect.tryPromise({
    try: () =>
      withOntologyWriteLock(vaultRoot, async () => {
        const handle = await openOntologyDb(vaultRoot);
        if (!handle) return { deleted: 0 };
        try {
          let deleted = 0;
          for (const table of TABLES_WITH_VAULT_PATH) {
            try {
              handle.db.run(`DELETE FROM ${table} WHERE vault_note_path = ?`, [vaultNotePath]);
              deleted += 1;
            } catch {
              /* table may be absent on older DBs */
            }
          }
          try {
            handle.db.run(
              `DELETE FROM field_confidence WHERE entity_id NOT IN (SELECT id FROM matters)
               AND entity_id NOT IN (SELECT id FROM clients)
               AND entity_id NOT IN (SELECT id FROM attorneys)
               AND entity_id NOT IN (SELECT id FROM documents)`
            );
          } catch {
            /* ignore */
          }
          await handle.persist();
          return { deleted };
        } finally {
          handle.close();
        }
      }),
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });
}

/** Promise façade. */
export async function deleteOntologyRowsByVaultNotePath(
  vaultRoot: string,
  vaultNotePath: string
): Promise<{ deleted: number }> {
  return Effect.runPromise(deleteOntologyRowsByVaultNotePathEffect(vaultRoot, vaultNotePath));
}
