/**
 * Payments directory: email (default) + optional @username + optional phone → tenantId.
 * Venmo / Cash App–style: pay to email out of the box; claim a username for privacy;
 * optional phone is a verified-claim alias (customer IdP — ClawQL is not a full IdP).
 * Lives outside the credits ledger — never write emails/phones into payment WORM.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Context, Data, Effect, Layer } from "effect";
import { resolvePaymentsDir } from "../config/paths.js";

export type DirectoryEntry = {
  readonly tenantId: string;
  /** Primary addressable identity (normalized lowercase). */
  readonly email?: string;
  /** Optional privacy username (no leading @). */
  readonly handle?: string;
  /** Optional E.164 phone (+15551234567). */
  readonly phone?: string;
  /**
   * When set, phone was asserted verified (operator/IdP claim).
   * Soft signal only — ClawQL does not run SMS OTP itself.
   */
  readonly phoneVerifiedAt?: string;
  readonly displayName?: string;
  readonly claimedAt: string;
  readonly updatedAt: string;
};

export type ResolvedRecipient = {
  tenantId: string;
  email?: string;
  handle?: string;
  phone?: string;
  displayName?: string;
  /** How the input was interpreted. */
  via: "email" | "handle" | "phone" | "tenantId";
};

type DirectoryFile = {
  version: 3;
  /** Normalized email → entry */
  emails: Record<string, DirectoryEntry>;
  /** Normalized handle (no @) → entry */
  handles: Record<string, DirectoryEntry>;
  /** E.164 phone → entry */
  phones: Record<string, DirectoryEntry>;
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
  if (!t || looksLikeEmail(t) || looksLikePhone(t)) return false;
  try {
    normalizeHandle(t);
    return true;
  } catch {
    return false;
  }
}

/**
 * Practical phone shape: optional +, then 8–15 digits (E.164 max 15).
 * Accepts common separators (spaces, dashes, parens) before normalize.
 */
const PHONE_LOOSE_RE = /^\+?[\d\s().-]{8,22}$/;

export function looksLikePhone(raw: string): boolean {
  const t = raw.trim();
  if (!t || t.startsWith("@") || looksLikeEmail(t)) return false;
  if (!PHONE_LOOSE_RE.test(t)) return false;
  const digits = t.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

/** Normalize to E.164-ish `+` + digits. US 10-digit → +1… when no country code. */
export function normalizePhone(raw: string, env: NodeJS.ProcessEnv = process.env): string {
  const t = raw.trim();
  if (!t) throw new Error("Phone required");
  if (!looksLikePhone(t)) {
    throw new Error(`Invalid phone "${raw}" — use E.164 like +15551234567`);
  }
  let digits = t.replace(/\D/g, "");
  const defaultCc = (env.CLAWQL_CREDITS_PHONE_DEFAULT_CC ?? "1").replace(/\D/g, "") || "1";
  if (!t.trim().startsWith("+") && digits.length === 10 && defaultCc === "1") {
    digits = `1${digits}`;
  }
  if (digits.length < 8 || digits.length > 15) {
    throw new Error(`Invalid phone "${raw}" — use E.164 like +15551234567`);
  }
  return `+${digits}`;
}

/** Redact for CLI list output — keep domain, mask local part. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  if (local.length <= 2) return `*@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

/** Mask middle digits: +1***567. */
export function maskPhone(phone: string): string {
  try {
    const n = normalizePhone(phone);
    if (n.length <= 5) return "+***";
    return `${n.slice(0, 2)}***${n.slice(-4)}`;
  } catch {
    return "+***";
  }
}

function parseTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const n = value.trim().toLowerCase();
  return n === "1" || n === "true" || n === "yes" || n === "on";
}

/** When true, claiming a phone requires an IdP/operator verified assertion. */
export function isPhoneVerifiedClaimRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseTruthy(env.CLAWQL_CREDITS_PHONE_REQUIRE_VERIFIED);
}

function emptyFile(): DirectoryFile {
  return { version: 3, emails: {}, handles: {}, phones: {}, byTenant: {} };
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
      phone: row.phone,
      phoneVerifiedAt: row.phoneVerifiedAt,
      claimedAt: row.claimedAt ?? now,
      updatedAt: row.updatedAt ?? now,
    };
    indexEntry(file, entry);
  }
  return file;
}

function migrateV2(parsed: {
  emails?: Record<string, DirectoryEntry>;
  handles?: Record<string, DirectoryEntry>;
  byTenant?: Record<string, DirectoryEntry>;
}): DirectoryFile {
  const file = emptyFile();
  for (const entry of Object.values(parsed.byTenant ?? {})) {
    indexEntry(file, entry);
  }
  // Prefer byTenant; fill gaps from email/handle indexes
  for (const entry of Object.values(parsed.emails ?? {})) {
    if (!file.byTenant[entry.tenantId]) indexEntry(file, entry);
  }
  for (const entry of Object.values(parsed.handles ?? {})) {
    if (!file.byTenant[entry.tenantId]) indexEntry(file, entry);
  }
  return file;
}

async function loadFile(env: NodeJS.ProcessEnv): Promise<DirectoryFile> {
  try {
    const raw = await readFile(resolveDirectoryPath(env), "utf8");
    const parsed = JSON.parse(raw) as {
      version?: number;
      emails?: Record<string, DirectoryEntry>;
      handles?: Record<string, DirectoryEntry>;
      phones?: Record<string, DirectoryEntry>;
      byTenant?: Record<string, DirectoryEntry>;
      tenants?: Record<string, string>;
    };
    if (!parsed || typeof parsed !== "object") return emptyFile();
    if (parsed.version === 3 && parsed.byTenant) {
      return {
        version: 3,
        emails: parsed.emails && typeof parsed.emails === "object" ? parsed.emails : {},
        handles: parsed.handles && typeof parsed.handles === "object" ? parsed.handles : {},
        phones: parsed.phones && typeof parsed.phones === "object" ? parsed.phones : {},
        byTenant: parsed.byTenant && typeof parsed.byTenant === "object" ? parsed.byTenant : {},
      };
    }
    if (parsed.version === 2 && parsed.byTenant) {
      return migrateV2(parsed);
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
  if (entry.phone) file.phones[entry.phone] = entry;
}

function unindexEntry(file: DirectoryFile, entry: DirectoryEntry): void {
  delete file.byTenant[entry.tenantId];
  if (entry.email) delete file.emails[entry.email];
  if (entry.handle) delete file.handles[entry.handle];
  if (entry.phone) delete file.phones[entry.phone];
}

async function getEmailEntry(
  email: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<DirectoryEntry | undefined> {
  const key = normalizeEmail(email);
  const file = await loadFile(env);
  return file.emails[key];
}

async function getHandleEntry(
  handle: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<DirectoryEntry | undefined> {
  const key = normalizeHandle(handle);
  const file = await loadFile(env);
  return file.handles[key];
}

async function getPhoneEntry(
  phone: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<DirectoryEntry | undefined> {
  const key = normalizePhone(phone, env);
  const file = await loadFile(env);
  return file.phones[key];
}

async function getTenantEntry(
  tenantId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<DirectoryEntry | undefined> {
  const id = tenantId.trim();
  if (!id) return undefined;
  const file = await loadFile(env);
  return file.byTenant[id];
}

async function listDirectory(env: NodeJS.ProcessEnv = process.env): Promise<DirectoryEntry[]> {
  const file = await loadFile(env);
  return Object.values(file.byTenant).sort((a, b) => {
    const ak = a.handle ?? a.email ?? a.phone ?? a.tenantId;
    const bk = b.handle ?? b.email ?? b.phone ?? b.tenantId;
    return ak.localeCompare(bk);
  });
}

export type ClaimDirectoryInput = {
  tenantId: string;
  /** Primary identity — recommended default. */
  email?: string;
  /** Optional privacy username. */
  handle?: string;
  /** Optional E.164 phone alias (maps to this tenant / email). */
  phone?: string;
  /**
   * Operator/IdP assertion that the phone was verified out-of-band.
   * Required when CLAWQL_CREDITS_PHONE_REQUIRE_VERIFIED=1.
   */
  phoneVerified?: boolean;
  displayName?: string;
};

/**
 * Claim or update directory identity for a tenant.
 * Email is the default payee; username (`handle`) and phone are optional aliases.
 */
export async function claimDirectory(
  input: ClaimDirectoryInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ entry: DirectoryEntry; created: boolean }> {
  const tenantId = input.tenantId.trim();
  if (!tenantId) throw new Error("tenantId required");
  if (!input.email?.trim() && !input.handle?.trim() && !input.phone?.trim()) {
    throw new Error("Provide --email (default) and/or --handle and/or --phone (optional aliases)");
  }

  const email = input.email?.trim() ? normalizeEmail(input.email) : undefined;
  const handle = input.handle?.trim() ? normalizeHandle(input.handle) : undefined;
  const phone = input.phone?.trim() ? normalizePhone(input.phone, env) : undefined;

  if (phone && isPhoneVerifiedClaimRequired(env) && !input.phoneVerified) {
    throw new Error(
      "Phone claim requires verified assertion (CLAWQL_CREDITS_PHONE_REQUIRE_VERIFIED=1). " +
        "Pass --verified after customer IdP / SMS proof, or unset the gate."
    );
  }

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
  if (phone) {
    const taken = file.phones[phone];
    if (taken && taken.tenantId !== tenantId) {
      throw new Error(`Phone ${phone} is already claimed by another tenant`);
    }
  }

  if (existing) unindexEntry(file, existing);

  const now = new Date().toISOString();
  let phoneVerifiedAt = existing?.phoneVerifiedAt;
  if (phone) {
    if (input.phoneVerified) phoneVerifiedAt = now;
    else if (phone !== existing?.phone) phoneVerifiedAt = undefined;
  }

  const entry: DirectoryEntry = {
    tenantId,
    email: email ?? existing?.email,
    handle: handle ?? existing?.handle,
    phone: phone ?? existing?.phone,
    phoneVerifiedAt: phone || existing?.phone ? phoneVerifiedAt : undefined,
    displayName: input.displayName?.trim() || existing?.displayName,
    claimedAt: existing?.claimedAt ?? now,
    updatedAt: now,
  };

  if (!entry.email && !entry.handle && !entry.phone) {
    throw new Error("Directory entry must have an email, username, and/or phone");
  }

  indexEntry(file, entry);
  await saveFile(file, env);
  return { entry, created: !existing };
}

function keepEntryIfAddressable(entry: DirectoryEntry): DirectoryEntry | null {
  if (entry.email || entry.handle || entry.phone) return entry;
  return null;
}

async function releaseHandle(
  handle: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  const key = normalizeHandle(handle);
  const file = await loadFile(env);
  const entry = file.handles[key];
  if (!entry) return false;
  unindexEntry(file, entry);
  const next = keepEntryIfAddressable({
    ...entry,
    handle: undefined,
    updatedAt: new Date().toISOString(),
  });
  if (next) indexEntry(file, next);
  await saveFile(file, env);
  return true;
}

async function releaseEmail(email: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const key = normalizeEmail(email);
  const file = await loadFile(env);
  const entry = file.emails[key];
  if (!entry) return false;
  unindexEntry(file, entry);
  const next = keepEntryIfAddressable({
    ...entry,
    email: undefined,
    updatedAt: new Date().toISOString(),
  });
  if (next) indexEntry(file, next);
  await saveFile(file, env);
  return true;
}

async function releasePhone(phone: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const key = normalizePhone(phone, env);
  const file = await loadFile(env);
  const entry = file.phones[key];
  if (!entry) return false;
  unindexEntry(file, entry);
  const next = keepEntryIfAddressable({
    ...entry,
    phone: undefined,
    phoneVerifiedAt: undefined,
    updatedAt: new Date().toISOString(),
  });
  if (next) indexEntry(file, next);
  await saveFile(file, env);
  return true;
}

/**
 * Resolve a payee string for P2P.
 * - Email → directory (required when shaped like email)
 * - Phone (E.164 / loose) → directory
 * - Leading `@` / username → directory
 * - Otherwise → raw tenant id
 */
async function resolveRecipient(
  raw: string,
  env: NodeJS.ProcessEnv = process.env,
  options: { forceHandle?: boolean; forceEmail?: boolean; forcePhone?: boolean } = {}
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
      phone: entry.phone,
      displayName: entry.displayName,
      via: "email",
    };
  }

  if (options.forcePhone || looksLikePhone(input)) {
    const entry = await getPhoneEntry(input, env);
    if (!entry) {
      throw new Error(
        `Unknown phone ${normalizePhone(input, env)} — claim with: clawql payments credits directory claim --phone …`
      );
    }
    return {
      tenantId: entry.tenantId,
      email: entry.email,
      handle: entry.handle,
      phone: entry.phone,
      displayName: entry.displayName,
      via: "phone",
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
        phone: entry.phone,
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

/** Reset directory file. Internal helper used by the service `reset` op. */
export async function resetDirectoryForTests(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await saveFile(emptyFile(), env);
}

export class DirectoryError extends Data.TaggedError("DirectoryError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

type ResolveRecipientOptions = {
  forceHandle?: boolean;
  forceEmail?: boolean;
  forcePhone?: boolean;
};

/** Effect surface over the payments directory (email / handle / phone → tenant). */
export class CreditsDirectoryService extends Context.Tag("clawql/CreditsDirectoryService")<
  CreditsDirectoryService,
  {
    readonly getEmail: (email: string) => Effect.Effect<DirectoryEntry | undefined, DirectoryError>;
    readonly getHandle: (
      handle: string
    ) => Effect.Effect<DirectoryEntry | undefined, DirectoryError>;
    readonly getPhone: (phone: string) => Effect.Effect<DirectoryEntry | undefined, DirectoryError>;
    readonly getTenant: (
      tenantId: string
    ) => Effect.Effect<DirectoryEntry | undefined, DirectoryError>;
    readonly list: () => Effect.Effect<DirectoryEntry[], DirectoryError>;
    readonly claim: (
      input: ClaimDirectoryInput
    ) => Effect.Effect<{ entry: DirectoryEntry; created: boolean }, DirectoryError>;
    readonly releaseEmail: (email: string) => Effect.Effect<boolean, DirectoryError>;
    readonly releaseHandle: (handle: string) => Effect.Effect<boolean, DirectoryError>;
    readonly releasePhone: (phone: string) => Effect.Effect<boolean, DirectoryError>;
    readonly resolveRecipient: (
      raw: string,
      options?: ResolveRecipientOptions
    ) => Effect.Effect<ResolvedRecipient, DirectoryError>;
    readonly reset: () => Effect.Effect<void, DirectoryError>;
  }
>() {}

export function creditsDirectoryLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<CreditsDirectoryService> {
  const run = <A>(reason: string, task: () => Promise<A>) =>
    Effect.tryPromise({
      try: task,
      catch: (cause) =>
        cause instanceof DirectoryError
          ? cause
          : new DirectoryError({ reason: cause instanceof Error ? cause.message : reason, cause }),
    });

  return Layer.succeed(
    CreditsDirectoryService,
    CreditsDirectoryService.of({
      getEmail: (email) => run("Failed to load email entry", () => getEmailEntry(email, env)),
      getHandle: (handle) => run("Failed to load handle entry", () => getHandleEntry(handle, env)),
      getPhone: (phone) => run("Failed to load phone entry", () => getPhoneEntry(phone, env)),
      getTenant: (tenantId) =>
        run("Failed to load tenant entry", () => getTenantEntry(tenantId, env)),
      list: () => run("Failed to list directory", () => listDirectory(env)),
      claim: (input) => run("Failed to claim directory entry", () => claimDirectory(input, env)),
      releaseEmail: (email) => run("Failed to release email", () => releaseEmail(email, env)),
      releaseHandle: (handle) => run("Failed to release handle", () => releaseHandle(handle, env)),
      releasePhone: (phone) => run("Failed to release phone", () => releasePhone(phone, env)),
      resolveRecipient: (raw, options) =>
        run("Failed to resolve recipient", () => resolveRecipient(raw, env, options)),
      reset: () => run("Failed to reset directory", () => resetDirectoryForTests(env)),
    })
  );
}
