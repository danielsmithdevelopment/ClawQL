/**
 * Pending-execution store backend selection.
 *
 * - `postgres`: shared DB; `UPDATE…WHERE` + `NOW()` — required for managed multi-node.
 * - `sqlite`: shared DB file; safe across processes on one node / shared volume.
 * - `file`: JSON + lockfile — single-process only.
 *
 * Selection:
 * 1. Explicit `CLAWQL_PENDING_STORE=postgres|sqlite|file`
 * 2. Else if `CLAWQL_PENDING_DATABASE_URL` set → postgres
 * 3. Else if managed multi-node signals → postgres (fails closed without URL)
 * 4. Else sqlite
 */

export type PendingStoreBackend = "postgres" | "sqlite" | "file";

/** True when the deployment must not use per-node SQLite for mandate consume. */
export function requiresSharedPendingPostgres(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.CLAWQL_PENDING_REQUIRE_POSTGRES?.trim() === "1") return true;
  if (env.CLAWQL_MANAGED_GATEWAY?.trim() === "1") return true;
  const surface = env.CLAWQL_CONSOLE_SURFACE?.trim().toLowerCase();
  if (surface === "cloud" || surface === "managed") return true;
  const replicas = Number(env.CLAWQL_GATEWAY_REPLICAS?.trim() || "1");
  if (Number.isFinite(replicas) && replicas > 1) return true;
  return false;
}

export function pendingStoreBackend(env: NodeJS.ProcessEnv = process.env): PendingStoreBackend {
  const raw = env.CLAWQL_PENDING_STORE?.trim().toLowerCase();
  if (raw === "postgres" || raw === "pg") return "postgres";
  if (raw === "file" || raw === "json") return "file";
  if (raw === "sqlite") return "sqlite";
  if (env.CLAWQL_PENDING_DATABASE_URL?.trim()) return "postgres";
  if (requiresSharedPendingPostgres(env)) return "postgres";
  return "sqlite";
}
