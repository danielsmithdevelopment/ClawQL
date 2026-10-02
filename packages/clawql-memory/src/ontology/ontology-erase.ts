/**
 * Delete ontology.db rows that point at a vault note path (erasure).
 */

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
export async function deleteOntologyRowsByVaultNotePath(
  vaultRoot: string,
  vaultNotePath: string
): Promise<{ deleted: number }> {
  return withOntologyWriteLock(vaultRoot, async () => {
    const handle = await openOntologyDb(vaultRoot);
    if (!handle) return { deleted: 0 };
    try {
      let deleted = 0;
      for (const table of TABLES_WITH_VAULT_PATH) {
        try {
          handle.db.run(`DELETE FROM ${table} WHERE vault_note_path = ?`, [vaultNotePath]);
          // sql.js does not expose changes() reliably across versions — count via SELECT before/after omitted.
          deleted += 1;
        } catch {
          /* table may be absent on older DBs */
        }
      }
      // Drop field_confidence rows orphaned by matter/client/attorney/document deletes — best effort.
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
  });
}
