/**
 * Payments directory: @handle → tenantId (Venmo / Cash App–style addressing).
 * Lives outside the credits ledger — handles are identity aliases, not balances.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolvePaymentsDir } from "../config/paths.js";

export type DirectoryEntry = {
  readonly handle: string;
  readonly tenantId: string;
  readonly displayName?: string;
  readonly claimedAt: string;
  readonly updatedAt: string;
};

export type ResolvedRecipient = {
  tenantId: string;
  handle?: string;
  displayName?: string;
  /** How the input was interpreted. */
  via: "handle" | "tenantId";
};

type DirectoryFile = {
  version: 1;
  /** Normalized handle (no @) → entry */
  handles: Record<string, DirectoryEntry>;
  /** tenantId → handle (at most one primary handle per tenant) */
  tenants: Record<string, string>;
};

const HANDLE_RE = /^[a-z][a-z0-9_-]{2,29}$/;

/** Names that must never be claimable (product / confusion / brand). */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "admin",
  "administrator",
  "api",
  "cashapp",
  "clawql",
  "default",
  "help",
  "me",
  "null",
  "official",
  "root",
  "support",
  "system",
  "venmo",
  "www",
]);

export function resolveDirectoryPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "directory.json");
}

/** Strip @, lowercase, validate shape. Throws on invalid. */
export function normalizeHandle(raw: string): string {
  const cleaned = raw.trim().replace(/^@+/, "").toLowerCase();
  if (!cleaned) throw new Error("Handle required");
  if (!HANDLE_RE.test(cleaned)) {
    throw new Error(
      `Invalid handle "${raw}" — use 3–30 chars: letter, then letters/digits/_/- (e.g. @alice)`
    );
  }
  if (RESERVED_HANDLES.has(cleaned)) {
    throw new Error(`Handle @${cleaned} is reserved`);
  }
  return cleaned;
}

/** True when string is handle-shaped (optional leading @). Does not check the directory. */
export function looksLikeHandle(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  try {
    normalizeHandle(t);
    return true;
  } catch {
    return false;
  }
}

function emptyFile(): DirectoryFile {
  return { version: 1, handles: {}, tenants: {} };
}

async function loadFile(env: NodeJS.ProcessEnv): Promise<DirectoryFile> {
  try {
    const raw = await readFile(resolveDirectoryPath(env), "utf8");
    const parsed = JSON.parse(raw) as DirectoryFile;
    if (!parsed || typeof parsed !== "object") return emptyFile();
    return {
      version: 1,
      handles: parsed.handles && typeof parsed.handles === "object" ? parsed.handles : {},
      tenants: parsed.tenants && typeof parsed.tenants === "object" ? parsed.tenants : {},
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyFile();
    throw err;
  }
}

async function saveFile(file: DirectoryFile, env: NodeJS.ProcessEnv): Promise<void> {
  const path = resolveDirectoryPath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
}

export async function getHandleEntry(
  handle: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<DirectoryEntry | undefined> {
  const key = normalizeHandle(handle);
  const file = await loadFile(env);
  return file.handles[key];
}

export async function getTenantHandle(
  tenantId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<DirectoryEntry | undefined> {
  const id = tenantId.trim();
  if (!id) return undefined;
  const file = await loadFile(env);
  const handle = file.tenants[id];
  if (!handle) return undefined;
  return file.handles[handle];
}

export async function listDirectory(
  env: NodeJS.ProcessEnv = process.env
): Promise<DirectoryEntry[]> {
  const file = await loadFile(env);
  return Object.values(file.handles).sort((a, b) => a.handle.localeCompare(b.handle));
}

export async function claimHandle(
  input: { handle: string; tenantId: string; displayName?: string },
  env: NodeJS.ProcessEnv = process.env
): Promise<{ entry: DirectoryEntry; created: boolean }> {
  const handle = normalizeHandle(input.handle);
  const tenantId = input.tenantId.trim();
  if (!tenantId) throw new Error("tenantId required");

  const file = await loadFile(env);
  const existing = file.handles[handle];
  if (existing && existing.tenantId !== tenantId) {
    throw new Error(`Handle @${handle} is already claimed by another tenant`);
  }

  const priorForTenant = file.tenants[tenantId];
  if (priorForTenant && priorForTenant !== handle && file.handles[priorForTenant]) {
    // One primary handle per tenant: release the old mapping.
    delete file.handles[priorForTenant];
  }

  const now = new Date().toISOString();
  const entry: DirectoryEntry = {
    handle,
    tenantId,
    displayName: input.displayName?.trim() || existing?.displayName,
    claimedAt: existing?.claimedAt ?? now,
    updatedAt: now,
  };
  file.handles[handle] = entry;
  file.tenants[tenantId] = handle;
  await saveFile(file, env);
  return { entry, created: !existing };
}

export async function releaseHandle(
  handle: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  const key = normalizeHandle(handle);
  const file = await loadFile(env);
  const entry = file.handles[key];
  if (!entry) return false;
  delete file.handles[key];
  if (file.tenants[entry.tenantId] === key) delete file.tenants[entry.tenantId];
  await saveFile(file, env);
  return true;
}

/**
 * Resolve a payee string for P2P.
 * - Leading `@` → directory lookup required
 * - Handle-shaped without `@` → directory if claimed, else raw tenant id
 * - Otherwise → raw tenant id
 */
export async function resolveRecipient(
  raw: string,
  env: NodeJS.ProcessEnv = process.env,
  options: { forceHandle?: boolean } = {}
): Promise<ResolvedRecipient> {
  const input = raw.trim();
  if (!input) throw new Error("Recipient required");

  const requireHandle = options.forceHandle || input.startsWith("@");
  if (requireHandle || looksLikeHandle(input)) {
    let entry: DirectoryEntry | undefined;
    try {
      entry = await getHandleEntry(input, env);
    } catch (err) {
      if (requireHandle) throw err;
      entry = undefined;
    }
    if (entry) {
      return {
        tenantId: entry.tenantId,
        handle: entry.handle,
        displayName: entry.displayName,
        via: "handle",
      };
    }
    if (requireHandle) {
      throw new Error(
        `Unknown handle @${normalizeHandle(input)} — claim with: clawql payments credits directory claim --handle …`
      );
    }
  }

  return { tenantId: input, via: "tenantId" };
}

/** Reset directory file (tests). */
export async function resetDirectoryForTests(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await saveFile(emptyFile(), env);
}
