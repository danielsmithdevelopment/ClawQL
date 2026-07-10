import { join } from "node:path";
import { getClawqlHome } from "../onboarding/paths.js";

export const SYNC_CONFIG_FILENAME = "sync.json";

/** Object key for the team manifest (under bucket prefix). */
export const MANIFEST_REL_KEY = ".clawql/sync/manifest.v1.json";

/** Default team-share paths under `~/.ClawQL` (secrets excluded). */
export const DEFAULT_SYNC_INCLUDE = [
  "Memory",
  "sources",
  "sources.json",
  "Dashboard/chats",
  "pageindex.db.json",
] as const;

/** Never uploaded — rebuild locally or keep per-machine. */
export const ALWAYS_EXCLUDE_REL = new Set([
  "vault/providers.json",
  "memory.db",
  "Dashboard/logs",
  SYNC_CONFIG_FILENAME,
  "clawql.env",
]);

export function getSyncConfigPath(home = getClawqlHome()): string {
  return join(home, SYNC_CONFIG_FILENAME);
}

export function normalizePrefix(prefix: string | undefined): string {
  const t = prefix?.trim() ?? "";
  if (!t) return "";
  return t.endsWith("/") ? t : `${t}/`;
}

export function objectKeyForRelPath(prefix: string, relPath: string): string {
  const p = normalizePrefix(prefix);
  const rel = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${p}${rel}`;
}

export function relPathFromObjectKey(prefix: string, key: string): string | null {
  const p = normalizePrefix(prefix);
  if (p && !key.startsWith(p)) return null;
  return key.slice(p.length);
}
