/**
 * Shared file-read guards for vault recall and allowlisted path tools (audit 4.01 / 4.03).
 * - Vault agent reads: only under Memory/ (or configured scan root), .md / .cqk, realpath-checked.
 * - File-root tools: no default cwd; refuse `/`, `$HOME`, `$CLAWQL_HOME`; deny secret paths.
 */

import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, relative, resolve, sep } from "node:path";
import { Effect } from "effect";

/** Relative prefixes under the vault / ClawQL home that agents must never read via tools. */
export const CLAWQL_SECRET_REL_PREFIXES = [
  "vault/",
  "Auth/",
  "worm/",
  "pending-executions/",
  "sources/",
  ".clawql/",
] as const;

const SECRET_BASENAMES = new Set(["clawql.env", "providers.json", "api-keys.json", "sources.json"]);

const ALLOWED_VAULT_READ_EXTS = new Set([".md", ".cqk"]);

export type VaultReadGuardError = {
  readonly code: "path_denied" | "not_memory" | "bad_extension" | "symlink_escape";
  readonly message: string;
};

function normalizeRel(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}

function isUnderPrefix(rel: string, prefix: string): boolean {
  const r = normalizeRel(rel);
  const p = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return r === prefix.replace(/\/$/, "") || r.startsWith(p);
}

/** True when a vault-relative path is a known secret / non-note location. */
export function isDeniedVaultSecretRel(relativePath: string): boolean {
  const rel = normalizeRel(relativePath);
  if (!rel) return true;
  const base = basename(rel);
  if (SECRET_BASENAMES.has(base)) return true;
  if (rel === "clawql.env" || rel.startsWith("clawql.env.")) return true;
  for (const prefix of CLAWQL_SECRET_REL_PREFIXES) {
    if (isUnderPrefix(rel, prefix)) return true;
  }
  // Dot-directories under the home/vault (e.g. .git, .ssh when vault=home).
  if (rel.split("/").some((seg) => seg.startsWith(".") && seg !== "." && seg !== "..")) {
    return true;
  }
  return false;
}

/**
 * Assert a vault-relative path is safe for agent-facing recall reads (read_around).
 * Compares realpath of the file to the Memory scan root so symlinks cannot escape.
 */
export async function assertSafeVaultMemoryRead(
  vaultRoot: string,
  relativePath: string,
  options?: { readonly memorySubdir?: string }
): Promise<{ readonly absolutePath: string; readonly relativePath: string }> {
  const memorySubdir = options?.memorySubdir?.trim() || "Memory";
  const rel = normalizeRel(relativePath);
  if (!rel || rel.split("/").some((p) => p === "..")) {
    throw Object.assign(new Error(`Invalid vault relative path: ${relativePath}`), {
      code: "path_denied" as const,
    });
  }
  if (isDeniedVaultSecretRel(rel)) {
    throw Object.assign(
      new Error(`Vault read refused for secret or non-note path: ${relativePath}`),
      { code: "path_denied" as const }
    );
  }
  if (!isUnderPrefix(rel, memorySubdir)) {
    throw Object.assign(
      new Error(`Vault reads are limited to ${memorySubdir}/ (.md / .cqk): ${relativePath}`),
      { code: "not_memory" as const }
    );
  }
  const ext = extname(rel).toLowerCase();
  if (!ALLOWED_VAULT_READ_EXTS.has(ext)) {
    throw Object.assign(new Error(`Vault reads allow only .md and .cqk files: ${relativePath}`), {
      code: "bad_extension" as const,
    });
  }

  const rootReal = await realpath(resolve(vaultRoot));
  const memoryRoot = resolve(rootReal, memorySubdir);
  let memoryReal: string;
  try {
    memoryReal = await realpath(memoryRoot);
  } catch {
    throw Object.assign(new Error(`Memory scan root missing: ${memorySubdir}/`), {
      code: "not_memory" as const,
    });
  }

  const candidate = resolve(rootReal, rel);
  let fileReal: string;
  try {
    fileReal = await realpath(candidate);
  } catch {
    throw Object.assign(new Error(`Vault path not found: ${relativePath}`), {
      code: "path_denied" as const,
    });
  }

  const memPrefix = memoryReal.endsWith(sep) ? memoryReal : memoryReal + sep;
  if (fileReal !== memoryReal && !fileReal.startsWith(memPrefix)) {
    throw Object.assign(new Error(`Vault read symlink escape refused: ${relativePath}`), {
      code: "symlink_escape" as const,
    });
  }

  const st = await stat(fileReal);
  if (!st.isFile()) {
    throw Object.assign(new Error(`Vault path is not a regular file: ${relativePath}`), {
      code: "path_denied" as const,
    });
  }

  return { absolutePath: fileReal, relativePath: rel };
}

export function assertSafeVaultMemoryReadEffect(
  vaultRoot: string,
  relativePath: string,
  options?: { readonly memorySubdir?: string }
): Effect.Effect<{ readonly absolutePath: string; readonly relativePath: string }, Error> {
  return Effect.tryPromise({
    try: () => assertSafeVaultMemoryRead(vaultRoot, relativePath, options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

function samePath(a: string, b: string): boolean {
  const na = resolve(a).replace(/\/+$/, "").toLowerCase();
  const nb = resolve(b).replace(/\/+$/, "").toLowerCase();
  return na === nb;
}

/**
 * Roots that must never be allowlisted for path tools (cwd default, whole disk, home, ClawQL home).
 */
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

/** Deny credential-like files under an allowlisted root. */
export function isForbiddenAllowlistedFile(absolutePath: string, root: string): boolean {
  const rel = relative(root, absolutePath).replace(/\\/g, "/");
  if (!rel || rel.startsWith("..")) return true;
  if (isDeniedVaultSecretRel(rel)) return true;
  const base = basename(absolutePath);
  const lower = base.toLowerCase();
  if (lower.endsWith(".pem") || lower.endsWith(".key")) return true;
  if (lower === ".env" || lower.startsWith(".env.")) return true;
  if (lower === "id_rsa" || lower === "id_ed25519" || lower === "credentials") return true;
  return false;
}

/**
 * Parse configured roots. Empty / unset → no roots (feature off). Drops forbidden roots.
 */
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
