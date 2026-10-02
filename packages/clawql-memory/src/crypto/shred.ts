/**
 * Crypto-shredding for git-native vault notes.
 *
 * Plaintext never lives in git history: each note is AES-256-GCM encrypted with a
 * per-note key stored outside the vault tree (`.clawql/note-keys/`). Erase destroys
 * the key so ciphertext in commits / R2 mirrors becomes permanently unreadable.
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

export async function ensureClawqlMetaGitignored(vaultRoot: string): Promise<void> {
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
}

export async function loadOrCreateNoteKey(vaultRoot: string, noteId: string): Promise<Buffer> {
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
}

export async function destroyNoteKey(vaultRoot: string, noteId: string): Promise<boolean> {
  try {
    await unlink(keyPath(vaultRoot, noteId));
    return true;
  } catch {
    return false;
  }
}

export async function noteKeyExists(vaultRoot: string, noteId: string): Promise<boolean> {
  try {
    await access(keyPath(vaultRoot, noteId));
    return true;
  } catch {
    return false;
  }
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

export async function maybeEncryptForVaultWrite(
  vaultRoot: string,
  relativePath: string,
  plaintext: string,
  opts?: { noteId?: string; env?: NodeJS.ProcessEnv }
): Promise<string> {
  const env = opts?.env ?? process.env;
  if (!memoryCryptoShredEnabled(env)) return plaintext;
  // Only encrypt Memory notes — never index/log/meta.
  const rel = relativePath.replace(/\\/g, "/");
  if (!rel.startsWith("Memory/") || /(^|\/)(index|log)\.md$/i.test(rel)) {
    return plaintext;
  }
  await ensureClawqlMetaGitignored(vaultRoot);
  let noteId = opts?.noteId ?? extractNoteIdFromEnvelope(plaintext);
  if (!noteId || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(noteId)) {
    noteId = randomUUID();
  }
  const key = await loadOrCreateNoteKey(vaultRoot, noteId);
  await upsertPathMapEntry(vaultRoot, {
    path: rel,
    noteId,
    contentHash: sha256Hex(plaintext),
  });
  return encryptNoteBody({ plaintext, noteId, key });
}

export async function maybeDecryptVaultRead(
  vaultRoot: string,
  text: string,
  _env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  void _env;
  if (!isEncryptedVaultEnvelope(text)) return text;
  const noteId = extractNoteIdFromEnvelope(text);
  if (!noteId) throw new Error("encrypted note missing note_id");
  if (!(await noteKeyExists(vaultRoot, noteId))) {
    throw new Error(`crypto-shredded: note key destroyed for ${noteId}`);
  }
  const key = await loadOrCreateNoteKey(vaultRoot, noteId);
  return decryptNoteBody({ envelope: text, key });
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function upsertPathMapEntry(
  vaultRoot: string,
  input: { path: string; noteId?: string; contentHash?: string; pathId?: string }
): Promise<PathMapEntry> {
  await mkdir(clawqlMetaDir(vaultRoot), { recursive: true });
  await ensureClawqlMetaGitignored(vaultRoot);
  const file = await readJsonFile<PathMapFile>(pathMapPath(vaultRoot), {
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
  await writeFile(pathMapPath(vaultRoot), `${JSON.stringify(file, null, 2)}\n`, "utf8");
  return entry;
}

export async function lookupPathMapByPath(
  vaultRoot: string,
  path: string
): Promise<PathMapEntry | undefined> {
  const file = await readJsonFile<PathMapFile>(pathMapPath(vaultRoot), {
    version: 1,
    entries: [],
  });
  return file.entries.find((e) => e.path === path);
}

export async function deletePathMapEntry(
  vaultRoot: string,
  path: string
): Promise<PathMapEntry | undefined> {
  const file = await readJsonFile<PathMapFile>(pathMapPath(vaultRoot), {
    version: 1,
    entries: [],
  });
  const found = file.entries.find((e) => e.path === path);
  if (!found) return undefined;
  file.entries = file.entries.filter((e) => e.path !== path);
  await mkdir(dirname(pathMapPath(vaultRoot)), { recursive: true });
  await writeFile(pathMapPath(vaultRoot), `${JSON.stringify(file, null, 2)}\n`, "utf8");
  return found;
}

export async function appendErasureDeny(
  vaultRoot: string,
  entry: Omit<ErasureDenyEntry, "erasedAt"> & { erasedAt?: string }
): Promise<ErasureDenyFile> {
  await mkdir(clawqlMetaDir(vaultRoot), { recursive: true });
  await ensureClawqlMetaGitignored(vaultRoot);
  const file = await readJsonFile<ErasureDenyFile>(denyListPath(vaultRoot), {
    version: 1,
    entries: [],
  });
  const next: ErasureDenyEntry = {
    contentHash: entry.contentHash,
    pathId: entry.pathId,
    noteId: entry.noteId,
    erasedAt: entry.erasedAt ?? new Date().toISOString(),
  };
  // Dedupe by contentHash
  file.entries = [...file.entries.filter((e) => e.contentHash !== next.contentHash), next];
  await writeFile(denyListPath(vaultRoot), `${JSON.stringify(file, null, 2)}\n`, "utf8");
  return file;
}

export async function loadErasureDenyHashes(vaultRoot: string): Promise<ReadonlySet<string>> {
  const file = await readJsonFile<ErasureDenyFile>(denyListPath(vaultRoot), {
    version: 1,
    entries: [],
  });
  return new Set(file.entries.map((e) => e.contentHash));
}

export async function loadErasureDenyFile(vaultRoot: string): Promise<ErasureDenyFile> {
  return readJsonFile<ErasureDenyFile>(denyListPath(vaultRoot), {
    version: 1,
    entries: [],
  });
}

/** Effect: load deny hashes for a vault (export gate). */
export function loadErasureDenyHashesEffect(vaultRoot: string): Effect.Effect<ReadonlySet<string>> {
  return Effect.tryPromise({
    try: () => loadErasureDenyHashes(vaultRoot),
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  }).pipe(Effect.orElseSucceed(() => new Set<string>()));
}
