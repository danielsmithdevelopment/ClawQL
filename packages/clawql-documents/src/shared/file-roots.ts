/**
 * Shared allowlist helpers for path tools (audit 4.03).
 * Kept local so documents does not need a clawql-memory rebuild for these guards.
 */

import { basename, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";

const SECRET_REL_PREFIXES = [
  "vault/",
  "Auth/",
  "worm/",
  "pending-executions/",
  "sources/",
  ".clawql/",
] as const;

const SECRET_BASENAMES = new Set([
  "clawql.env",
  "providers.json",
  "api-keys.json",
  "sources.json",
]);

function normalizeRel(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}

function isUnderPrefix(rel: string, prefix: string): boolean {
  const r = normalizeRel(rel);
  const p = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return r === prefix.replace(/\/$/, "") || r.startsWith(p);
}

function samePath(a: string, b: string): boolean {
  const na = resolve(a).replace(/\/+$/, "").toLowerCase();
  const nb = resolve(b).replace(/\/+$/, "").toLowerCase();
  return na === nb;
}

export function isForbiddenFileRoot(root: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const resolved = resolve(root);
  if (samePath(resolved, sep) || resolved === "/") return true;
  try {
    if (samePath(resolved, homedir())) return true;
  } catch {
    /* ignore */
  }
  const clawHome = env.CLAWQL_HOME?.trim();
  if (clawHome && samePath(resolved, clawHome)) return true;
  return false;
}

export function isForbiddenAllowlistedFile(absolutePath: string, root: string): boolean {
  const rel = relative(root, absolutePath).replace(/\\/g, "/");
  if (!rel || rel.startsWith("..")) return true;
  const n = normalizeRel(rel);
  if (SECRET_BASENAMES.has(basename(n))) return true;
  if (n === "clawql.env" || n.startsWith("clawql.env.")) return true;
  for (const prefix of SECRET_REL_PREFIXES) {
    if (isUnderPrefix(n, prefix)) return true;
  }
  if (n.split("/").some((seg) => seg.startsWith(".") && seg !== "." && seg !== "..")) {
    return true;
  }
  const base = basename(absolutePath);
  const lower = base.toLowerCase();
  if (lower.endsWith(".pem") || lower.endsWith(".key")) return true;
  if (lower === ".env" || lower.startsWith(".env.")) return true;
  if (lower === "id_rsa" || lower === "id_ed25519" || lower === "credentials") return true;
  return false;
}

export function filterConfiguredFileRoots(
  configured: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const out: string[] = [];
  for (const raw of configured) {
    const t = raw.trim();
    if (!t) continue;
    const abs = resolve(t);
    if (isForbiddenFileRoot(abs, env)) continue;
    out.push(abs);
  }
  return out;
}
