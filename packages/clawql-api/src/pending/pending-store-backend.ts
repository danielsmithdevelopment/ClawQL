/**
 * Pending-execution store backend selection.
 *
 * - `sqlite` (default): shared DB file; SQL conditional consume is safe across
 *   gateway *processes* sharing CLAWQL_HOME. Required for the multi-process race test.
 * - `file`: per-record JSON + lockfile — single-process / shared-volume only.
 * - Multi-node managed: use Postgres with the same UPDATE…WHERE predicate (follow-on).
 */

export type PendingStoreBackend = "sqlite" | "file";

export function pendingStoreBackend(env: NodeJS.ProcessEnv = process.env): PendingStoreBackend {
  const raw = env.CLAWQL_PENDING_STORE?.trim().toLowerCase();
  if (raw === "file" || raw === "json") return "file";
  return "sqlite";
}
