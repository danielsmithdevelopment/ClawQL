/**
 * Crypto-shredding for git-native vault notes.
 *
 * Plaintext never lives in git history: each note is AES-256-GCM encrypted with a
 * per-note key stored outside the vault tree (`.clawql/note-keys/`). Erase destroys
 * the key so ciphertext in commits / R2 mirrors becomes permanently unreadable.
 *
 * Domain APIs are Effect-primary; thin Promise façades remain for erase/MCP edges.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Effect } from "effect";

export const CRYPTO_SHRED_MARKER = "CLAWQL_ENCRYPTED_V1:";
export const CLAWQL_META_DIR = ".clawql";

export function memoryCryptoShredEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_MEMORY_CRYPTO_SHRED?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  if (raw === "1" || raw === "true" || raw === "on" || raw === "yes") return true;
  // Default on when the vault is git-backed (history otherwise retains plaintext forever).
  const backend = env.CLAWQL_MEMORY_BACKEND?.trim().toLowerCase();
  return backend === "git";
}

export function clawqlMetaDir(vaultRoot: string): string {
  return join(vaultRoot, CLAWQL_META_DIR);
}

export function noteKeysDir(vaultRoot: string): string {
  return join(clawqlMetaDir(vaultRoot), "note-keys");
}

function pathMapPath(vaultRoot: string): string {
  return join(clawqlMetaDir(vaultRoot), "path-map.json");
}

function denyListPath(vaultRoot: string): string {
  return join(clawqlMetaDir(vaultRoot), "erasure-deny.json");
}

export type PathMapEntry = {
  pathId: string;
  path: string;
  noteId?: string;
  contentHash?: string;
  createdAt: string;
};

export type PathMapFile = {
  version: 1;
  entries: PathMapEntry[];
};

export type ErasureDenyEntry = {
  contentHash: string;
  pathId: string;
  noteId?: string;
  erasedAt: string;
};

export type ErasureDenyFile = {
  version: 1;
  entries: ErasureDenyEntry[];
};

export function isEncryptedVaultEnvelope(text: string): boolean {
  return text.includes(CRYPTO_SHRED_MARKER);
}

export function extractNoteIdFromEnvelope(text: string): string | undefined {
  const m = text.match(/^note_id:\s*([a-f0-9-]{36})\s*$/m);
  return m?.[1];
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function keyPath(vaultRoot: string, noteId: string): string {
  return join(noteKeysDir(vaultRoot), `${noteId}.key`);
}

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

function fromPromise<A>(tryFn: () => Promise<A>): Effect.Effect<A, Error> {
  return Effect.tryPromise({ try: tryFn, catch: asError });
}

export function ensureClawqlMetaGitignoredEffect(vaultRoot: string): Effect.Effect<void, Error> {
  return fromPromise(async () => {
    const gi = join(vaultRoot, ".gitignore");
    const line = `${CLAWQL_META_DIR}/`;
    let existing = "";
    try {
      existing = await readFile(gi, "utf8");
    } catch {
      /* create */
    }
    if (existing.split("\n").some((l) => l.trim() === line || l.trim() === CLAWQL_META_DIR)) {
      return;
    }
    const next =
      existing.endsWith("\n") || existing === "" ? `${existing}${line}\n` : `${existing}\n${line}\n`;
    await writeFile(gi, next, "utf8");
  });
}

/** Promise façade. */
export async function ensureClawqlMetaGitignored(vaultRoot: string): Promise<void> {
  return Effect.runPromise(ensureClawqlMetaGitignoredEffect(vaultRoot));
}

export function loadOrCreateNoteKeyEffect(
  vaultRoot: string,
  noteId: string
): Effect.Effect<Buffer, Error> {
  return fromPromise(async () => {
    await mkdir(noteKeysDir(vaultRoot), { recursive: true });
    const p = keyPath(vaultRoot, noteId);
    try {
      const hex = (await readFile(p, "utf8")).trim();
      if (/^[a-f0-9]{64}$/i.test(hex)) return Buffer.from(hex, "hex");
    } catch {
      /* create */
    }
    const key = randomBytes(32);
    await writeFile(p, `${key.toString("hex")}\n`, { mode: 0o600 });
    return key;
  });
}

/** Promise façade. */
export async function loadOrCreateNoteKey(vaultRoot: string, noteId: string): Promise<Buffer> {
  return Effect.runPromise(loadOrCreateNoteKeyEffect(vaultRoot, noteId));
}

export function destroyNoteKeyEffect(
  vaultRoot: string,
  noteId: string
): Effect.Effect<boolean, Error> {
  return fromPromise(async () => {
    try {
      await unlink(keyPath(vaultRoot, noteId));
      return true;
    } catch {
      return false;
    }
  });
}

/** Promise façade. */
export async function destroyNoteKey(vaultRoot: string, noteId: string): Promise<boolean> {
  return Effect.runPromise(destroyNoteKeyEffect(vaultRoot, noteId));
}

export function noteKeyExistsEffect(
  vaultRoot: string,
  noteId: string
): Effect.Effect<boolean, Error> {
  return fromPromise(async () => {
    try {
      await access(keyPath(vaultRoot, noteId));
      return true;
    } catch {
      return false;
    }
  });
}

/** Promise façade. */
export async function noteKeyExists(vaultRoot: string, noteId: string): Promise<boolean> {
  return Effect.runPromise(noteKeyExistsEffect(vaultRoot, noteId));
}

/** Encrypt plaintext → vault envelope (frontmatter + ciphertext). Keeps note_id stable. */
export function encryptNoteBody(opts: { plaintext: string; noteId: string; key: Buffer }): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", opts.key, iv);
  const ct = Buffer.concat([cipher.update(opts.plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, ct]).toString("base64");
  const contentHash = sha256Hex(opts.plaintext);
  return [
    "---",
    "clawql_crypto: v1",
    `note_id: ${opts.noteId}`,
    `content_hash: sha256:${contentHash}`,
    "---",
    "",
    `${CRYPTO_SHRED_MARKER}${packed}`,
    "",
  ].join("\n");
}

/** Decrypt vault envelope → plaintext. Throws if key missing/wrong. */
export function decryptNoteBody(opts: { envelope: string; key: Buffer }): string {
  const idx = opts.envelope.indexOf(CRYPTO_SHRED_MARKER);
  if (idx < 0) throw new Error("not an encrypted vault envelope");
  const b64 = opts.envelope.slice(idx + CRYPTO_SHRED_MARKER.length).trim();
  const packed = Buffer.from(b64, "base64");
  if (packed.length < 12 + 16) throw new Error("truncated ciphertext");
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ct = packed.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", opts.key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function maybeEncryptForVaultWriteEffect(
  vaultRoot: string,
  relativePath: string,
  plaintext: string,
  opts?: { noteId?: string; env?: NodeJS.ProcessEnv }
): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    const env = opts?.env ?? process.env;
    if (!memoryCryptoShredEnabled(env)) return plaintext;
    const rel = relativePath.replace(/\\/g, "/");
    if (!rel.startsWith("Memory/") || /(^|\/)(index|log)\.md$/i.test(rel)) {
      return plaintext;
    }
    yield* ensureClawqlMetaGitignoredEffect(vaultRoot);
    let noteId = opts?.noteId ?? extractNoteIdFromEnvelope(plaintext);
    if (
      !noteId ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(noteId)
    ) {
      noteId = randomUUID();
    }
    const key = yield* loadOrCreateNoteKeyEffect(vaultRoot, noteId);
    yield* upsertPathMapEntryEffect(vaultRoot, {
      path: rel,
      noteId,
      contentHash: sha256Hex(plaintext),
    });
    return encryptNoteBody({ plaintext, noteId, key });
  });
}

/** Promise façade. */
export async function maybeEncryptForVaultWrite(
  vaultRoot: string,
  relativePath: string,
  plaintext: string,
  opts?: { noteId?: string; env?: NodeJS.ProcessEnv }
): Promise<string> {
  return Effect.runPromise(
    maybeEncryptForVaultWriteEffect(vaultRoot, relativePath, plaintext, opts)
  );
}

export function maybeDecryptVaultReadEffect(
  vaultRoot: string,
  text: string,
  _env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string, Error> {
  void _env;
  return Effect.gen(function* () {
    if (!isEncryptedVaultEnvelope(text)) return text;
    const noteId = extractNoteIdFromEnvelope(text);
    if (!noteId) return yield* Effect.fail(new Error("encrypted note missing note_id"));
    const exists = yield* noteKeyExistsEffect(vaultRoot, noteId);
    if (!exists) {
      return yield* Effect.fail(new Error(`crypto-shredded: note key destroyed for ${noteId}`));
    }
    const key = yield* loadOrCreateNoteKeyEffect(vaultRoot, noteId);
    return yield* Effect.try({
      try: () => decryptNoteBody({ envelope: text, key }),
      catch: asError,
    });
  });
}

/** Promise façade. */
export async function maybeDecryptVaultRead(
  vaultRoot: string,
  text: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  return Effect.runPromise(maybeDecryptVaultReadEffect(vaultRoot, text, env));
}

function readJsonFileEffect<T>(path: string, fallback: T): Effect.Effect<T, Error> {
  return fromPromise(async () => {
    try {
      return JSON.parse(await readFile(path, "utf8")) as T;
    } catch {
      return fallback;
    }
  });
}

export function upsertPathMapEntryEffect(
  vaultRoot: string,
  input: { path: string; noteId?: string; contentHash?: string; pathId?: string }
): Effect.Effect<PathMapEntry, Error> {
  return Effect.gen(function* () {
    yield* fromPromise(() => mkdir(clawqlMetaDir(vaultRoot), { recursive: true }).then(() => undefined));
    yield* ensureClawqlMetaGitignoredEffect(vaultRoot);
    const file = yield* readJsonFileEffect<PathMapFile>(pathMapPath(vaultRoot), {
      version: 1,
      entries: [],
    });
    const existing = file.entries.find((e) => e.path === input.path);
    const entry: PathMapEntry = {
      pathId: input.pathId ?? existing?.pathId ?? randomBytes(16).toString("hex"),
      path: input.path,
      noteId: input.noteId ?? existing?.noteId,
      contentHash: input.contentHash ?? existing?.contentHash,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    file.entries = [...file.entries.filter((e) => e.path !== input.path), entry];
    yield* fromPromise(() =>
      writeFile(pathMapPath(vaultRoot), `${JSON.stringify(file, null, 2)}\n`, "utf8")
    );
    return entry;
  });
}

/** Promise façade. */
export async function upsertPathMapEntry(
  vaultRoot: string,
  input: { path: string; noteId?: string; contentHash?: string; pathId?: string }
): Promise<PathMapEntry> {
  return Effect.runPromise(upsertPathMapEntryEffect(vaultRoot, input));
}

export function lookupPathMapByPathEffect(
  vaultRoot: string,
  path: string
): Effect.Effect<PathMapEntry | undefined, Error> {
  return Effect.gen(function* () {
    const file = yield* readJsonFileEffect<PathMapFile>(pathMapPath(vaultRoot), {
      version: 1,
      entries: [],
    });
    return file.entries.find((e) => e.path === path);
  });
}

/** Promise façade. */
export async function lookupPathMapByPath(
  vaultRoot: string,
  path: string
): Promise<PathMapEntry | undefined> {
  return Effect.runPromise(lookupPathMapByPathEffect(vaultRoot, path));
}

export function deletePathMapEntryEffect(
  vaultRoot: string,
  path: string
): Effect.Effect<PathMapEntry | undefined, Error> {
  return Effect.gen(function* () {
    const file = yield* readJsonFileEffect<PathMapFile>(pathMapPath(vaultRoot), {
      version: 1,
      entries: [],
    });
    const found = file.entries.find((e) => e.path === path);
    if (!found) return undefined;
    file.entries = file.entries.filter((e) => e.path !== path);
    yield* fromPromise(() => mkdir(dirname(pathMapPath(vaultRoot)), { recursive: true }).then(() => undefined));
    yield* fromPromise(() =>
      writeFile(pathMapPath(vaultRoot), `${JSON.stringify(file, null, 2)}\n`, "utf8")
    );
    return found;
  });
}

/** Promise façade. */
export async function deletePathMapEntry(
  vaultRoot: string,
  path: string
): Promise<PathMapEntry | undefined> {
  return Effect.runPromise(deletePathMapEntryEffect(vaultRoot, path));
}

export function appendErasureDenyEffect(
  vaultRoot: string,
  entry: Omit<ErasureDenyEntry, "erasedAt"> & { erasedAt?: string }
): Effect.Effect<ErasureDenyFile, Error> {
  return Effect.gen(function* () {
    yield* fromPromise(() => mkdir(clawqlMetaDir(vaultRoot), { recursive: true }).then(() => undefined));
    yield* ensureClawqlMetaGitignoredEffect(vaultRoot);
    const file = yield* readJsonFileEffect<ErasureDenyFile>(denyListPath(vaultRoot), {
      version: 1,
      entries: [],
    });
    const next: ErasureDenyEntry = {
      contentHash: entry.contentHash,
      pathId: entry.pathId,
      noteId: entry.noteId,
      erasedAt: entry.erasedAt ?? new Date().toISOString(),
    };
    file.entries = [...file.entries.filter((e) => e.contentHash !== next.contentHash), next];
    yield* fromPromise(() =>
      writeFile(denyListPath(vaultRoot), `${JSON.stringify(file, null, 2)}\n`, "utf8")
    );
    return file;
  });
}

/** Promise façade. */
export async function appendErasureDeny(
  vaultRoot: string,
  entry: Omit<ErasureDenyEntry, "erasedAt"> & { erasedAt?: string }
): Promise<ErasureDenyFile> {
  return Effect.runPromise(appendErasureDenyEffect(vaultRoot, entry));
}

export function loadErasureDenyHashesEffectInner(
  vaultRoot: string
): Effect.Effect<ReadonlySet<string>, Error> {
  return Effect.gen(function* () {
    const file = yield* readJsonFileEffect<ErasureDenyFile>(denyListPath(vaultRoot), {
      version: 1,
      entries: [],
    });
    return new Set(file.entries.map((e) => e.contentHash));
  });
}

/** Promise façade. */
export async function loadErasureDenyHashes(vaultRoot: string): Promise<ReadonlySet<string>> {
  return Effect.runPromise(loadErasureDenyHashesEffectInner(vaultRoot));
}

export function loadErasureDenyFileEffect(vaultRoot: string): Effect.Effect<ErasureDenyFile, Error> {
  return readJsonFileEffect<ErasureDenyFile>(denyListPath(vaultRoot), {
    version: 1,
    entries: [],
  });
}

/** Promise façade. */
export async function loadErasureDenyFile(vaultRoot: string): Promise<ErasureDenyFile> {
  return Effect.runPromise(loadErasureDenyFileEffect(vaultRoot));
}

/** Effect: load deny hashes for a vault (export gate) — soft-fail to empty set. */
export function loadErasureDenyHashesEffect(vaultRoot: string): Effect.Effect<ReadonlySet<string>> {
  return loadErasureDenyHashesEffectInner(vaultRoot).pipe(
    Effect.orElseSucceed(() => new Set<string>())
  );
}
