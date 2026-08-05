/**
 * Payments directory: email (default) + optional @username → tenantId.
 * Venmo / Cash App–style: pay to email out of the box; claim a username for privacy.
 * Lives outside the credits ledger — never write emails into payment WORM.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolvePaymentsDir } from "../config/paths.js";

export type DirectoryEntry = {
  readonly tenantId: string;
  /** Primary addressable identity (normalized lowercase). */
  readonly email?: string;
  /** Optional privacy username (no leading @). */
  readonly handle?: string;
  readonly displayName?: string;
  readonly claimedAt: string;
  readonly updatedAt: string;
};

export type ResolvedRecipient = {
  tenantId: string;
  email?: string;
  handle?: string;
  displayName?: string;
  /** How the input was interpreted. */
  via: "email" | "handle" | "tenantId";
};

type DirectoryFile = {
  version: 2;
  /** Normalized email → entry */
  emails: Record<string, DirectoryEntry>;
  /** Normalized handle (no @) → entry */
  handles: Record<string, DirectoryEntry>;
  /** tenantId → canonical entry */
  byTenant: Record<string, DirectoryEntry>;
};

const HANDLE_RE = /^[a-z][a-z0-9_-]{2,29}$/;
/** Practical email shape — not a full RFC parser. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Names that must never be claimable as usernames. */
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

export function normalizeEmail(raw: string): string {
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) throw new Error("Email required");
  if (!EMAIL_RE.test(cleaned)) {
    throw new Error(`Invalid email "${raw}"`);
  }
  return cleaned;
}

/** Strip @, lowercase, validate username shape. Throws on invalid. */
export function normalizeHandle(raw: string): string {
  const cleaned = raw.trim().replace(/^@+/, "").toLowerCase();
  if (!cleaned) throw new Error("Handle required");
  if (!HANDLE_RE.test(cleaned)) {
    throw new Error(
      `Invalid username "${raw}" — use 3–30 chars: letter, then letters/digits/_/- (e.g. @alice)`
    );
  }
  if (RESERVED_HANDLES.has(cleaned)) {
    throw new Error(`Username @${cleaned} is reserved`);
  }
  return cleaned;
}

export function looksLikeEmail(raw: string): boolean {
  const t = raw.trim();
  if (!t || t.startsWith("@")) return false;
  return EMAIL_RE.test(t.toLowerCase());
}

/** True when string is username-shaped (optional leading @). Does not check the directory. */
export function looksLikeHandle(raw: string): boolean {
  const t = raw.trim();
  if (!t || looksLikeEmail(t)) return false;
  try {
    normalizeHandle(t);
    return true;
  } catch {
    return false;
  }
}

/** Redact for CLI list output — keep domain, mask local part. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  if (local.length <= 2) return `*@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

function emptyFile(): DirectoryFile {
  return { version: 2, emails: {}, handles: {}, byTenant: {} };
}

function migrateV1(parsed: {
  handles?: Record<string, DirectoryEntry & { handle?: string }>;
  tenants?: Record<string, string>;
}): DirectoryFile {
  const file = emptyFile();
  const now = new Date().toISOString();
  for (const [key, row] of Object.entries(parsed.handles ?? {})) {
    const handle = row.handle ?? key;
    const entry: DirectoryEntry = {
      tenantId: row.tenantId,
      handle,
      displayName: row.displayName,
      email: row.email,
      claimedAt: row.claimedAt ?? now,
      updatedAt: row.updatedAt ?? now,
    };
    file.handles[handle] = entry;
    file.byTenant[entry.tenantId] = entry;
    if (entry.email) file.emails[entry.email] = entry;
  }
  return file;
}

async function loadFile(env: NodeJS.ProcessEnv): Promise<DirectoryFile> {
  try {
    const raw = await readFile(resolveDirectoryPath(env), "utf8");
    const parsed = JSON.parse(raw) as DirectoryFile & {
      version?: number;
      tenants?: Record<string, string>;
    };
    if (!parsed || typeof parsed !== "object") return emptyFile();
    if (parsed.version === 2 && parsed.byTenant) {
      return {
        version: 2,
        emails: parsed.emails && typeof parsed.emails === "object" ? parsed.emails : {},
        handles: parsed.handles && typeof parsed.handles === "object" ? parsed.handles : {},
        byTenant: parsed.byTenant && typeof parsed.byTenant === "object" ? parsed.byTenant : {},
      };
    }
    // v1: { handles, tenants }
    return migrateV1(parsed);
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

function indexEntry(file: DirectoryFile, entry: DirectoryEntry): void {
  file.byTenant[entry.tenantId] = entry;
  if (entry.email) file.emails[entry.email] = entry;
  if (entry.handle) file.handles[entry.handle] = entry;
}

function unindexEntry(file: DirectoryFile, entry: DirectoryEntry): void {
  delete file.byTenant[entry.tenantId];
  if (entry.email) delete file.emails[entry.email];
  if (entry.handle) delete file.handles[entry.handle];
}

export async function getEmailEntry(
  email: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<DirectoryEntry | undefined> {
  const key = normalizeEmail(email);
  const file = await loadFile(env);
  return file.emails[key];
}

export async function getHandleEntry(
  handle: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<DirectoryEntry | undefined> {
  const key = normalizeHandle(handle);
  const file = await loadFile(env);
  return file.handles[key];
}

export async function getTenantEntry(
  tenantId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<DirectoryEntry | undefined> {
  const id = tenantId.trim();
  if (!id) return undefined;
  const file = await loadFile(env);
  return file.byTenant[id];
}

/** @deprecated Prefer getTenantEntry */
export async function getTenantHandle(
  tenantId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<DirectoryEntry | undefined> {
  return getTenantEntry(tenantId, env);
}

export async function listDirectory(
  env: NodeJS.ProcessEnv = process.env
): Promise<DirectoryEntry[]> {
  const file = await loadFile(env);
  return Object.values(file.byTenant).sort((a, b) => {
    const ak = a.handle ?? a.email ?? a.tenantId;
    const bk = b.handle ?? b.email ?? b.tenantId;
    return ak.localeCompare(bk);
  });
}

export type ClaimDirectoryInput = {
  tenantId: string;
  /** Primary identity — recommended default. */
  email?: string;
  /** Optional privacy username. */
  handle?: string;
  displayName?: string;
};

/**
 * Claim or update directory identity for a tenant.
 * Email is the default payee; username (`handle`) is optional for privacy.
 */
export async function claimDirectory(
  input: ClaimDirectoryInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ entry: DirectoryEntry; created: boolean }> {
  const tenantId = input.tenantId.trim();
  if (!tenantId) throw new Error("tenantId required");
  if (!input.email?.trim() && !input.handle?.trim()) {
    throw new Error("Provide --email (default) and/or --handle (optional privacy username)");
  }

  const email = input.email?.trim() ? normalizeEmail(input.email) : undefined;
  const handle = input.handle?.trim() ? normalizeHandle(input.handle) : undefined;

  const file = await loadFile(env);
  const existing = file.byTenant[tenantId];

  if (email) {
    const taken = file.emails[email];
    if (taken && taken.tenantId !== tenantId) {
      throw new Error(`Email ${email} is already claimed by another tenant`);
    }
  }
  if (handle) {
    const taken = file.handles[handle];
    if (taken && taken.tenantId !== tenantId) {
      throw new Error(`Username @${handle} is already claimed by another tenant`);
    }
  }

  if (existing) unindexEntry(file, existing);

  const now = new Date().toISOString();
  const entry: DirectoryEntry = {
    tenantId,
    email: email ?? existing?.email,
    handle: handle ?? existing?.handle,
    displayName: input.displayName?.trim() || existing?.displayName,
    claimedAt: existing?.claimedAt ?? now,
    updatedAt: now,
  };

  if (!entry.email && !entry.handle) {
    throw new Error("Directory entry must have an email and/or username");
  }

  indexEntry(file, entry);
  await saveFile(file, env);
  return { entry, created: !existing };
}

/** Convenience: claim email as primary (Venmo-style default). */
export async function claimEmail(
  input: { email: string; tenantId: string; displayName?: string; handle?: string },
  env: NodeJS.ProcessEnv = process.env
): Promise<{ entry: DirectoryEntry; created: boolean }> {
  return claimDirectory(input, env);
}

/** Convenience: set optional privacy username. */
export async function claimHandle(
  input: { handle: string; tenantId: string; displayName?: string; email?: string },
  env: NodeJS.ProcessEnv = process.env
): Promise<{ entry: DirectoryEntry; created: boolean }> {
  return claimDirectory(input, env);
}

export async function releaseHandle(
  handle: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  const key = normalizeHandle(handle);
  const file = await loadFile(env);
  const entry = file.handles[key];
  if (!entry) return false;
  unindexEntry(file, entry);
  if (entry.email) {
    indexEntry(file, {
      ...entry,
      handle: undefined,
      updatedAt: new Date().toISOString(),
    });
  }
  await saveFile(file, env);
  return true;
}

export async function releaseEmail(
  email: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  const key = normalizeEmail(email);
  const file = await loadFile(env);
  const entry = file.emails[key];
  if (!entry) return false;
  unindexEntry(file, entry);
  if (entry.handle) {
    indexEntry(file, {
      ...entry,
      email: undefined,
      updatedAt: new Date().toISOString(),
    });
  }
  await saveFile(file, env);
  return true;
}

/**
 * Resolve a payee string for P2P.
 * - Email → directory (required when shaped like email)
 * - Leading `@` / username → directory
 * - Otherwise → raw tenant id
 */
export async function resolveRecipient(
  raw: string,
  env: NodeJS.ProcessEnv = process.env,
  options: { forceHandle?: boolean; forceEmail?: boolean } = {}
): Promise<ResolvedRecipient> {
  const input = raw.trim();
  if (!input) throw new Error("Recipient required");

  if (options.forceEmail || looksLikeEmail(input)) {
    const entry = await getEmailEntry(input, env);
    if (!entry) {
      throw new Error(
        `Unknown email ${normalizeEmail(input)} — claim with: clawql payments credits directory claim --email …`
      );
    }
    return {
      tenantId: entry.tenantId,
      email: entry.email,
      handle: entry.handle,
      displayName: entry.displayName,
      via: "email",
    };
  }

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
        email: entry.email,
        handle: entry.handle,
        displayName: entry.displayName,
        via: "handle",
      };
    }
    if (requireHandle) {
      throw new Error(
        `Unknown username @${normalizeHandle(input)} — claim with: clawql payments credits directory claim --handle …`
      );
    }
  }

  return { tenantId: input, via: "tenantId" };
}

/** Reset directory file (tests). */
export async function resetDirectoryForTests(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await saveFile(emptyFile(), env);
}
