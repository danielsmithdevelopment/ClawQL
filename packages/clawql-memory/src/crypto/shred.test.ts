import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendErasureDeny,
  decryptNoteBody,
  destroyNoteKey,
  encryptNoteBody,
  isEncryptedVaultEnvelope,
  loadErasureDenyHashes,
  loadOrCreateNoteKey,
  maybeDecryptVaultRead,
  maybeEncryptForVaultWrite,
  memoryCryptoShredEnabled,
  sha256Hex,
  upsertPathMapEntry,
  deletePathMapEntry,
} from "./shred.js";

describe("crypto-shred", () => {
  const dirs: string[] = [];
  const saved: Record<string, string | undefined> = {};

  afterEach(async () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    for (const d of dirs.splice(0)) {
      await rm(d, { recursive: true, force: true });
    }
  });

  function stash(key: string): void {
    saved[key] = process.env[key];
  }

  async function freshVault(): Promise<string> {
    const d = await mkdtemp(join(tmpdir(), "clawql-shred-"));
    dirs.push(d);
    return d;
  }

  it("memoryCryptoShredEnabled defaults on for git backend", () => {
    stash("CLAWQL_MEMORY_BACKEND");
    stash("CLAWQL_MEMORY_CRYPTO_SHRED");
    process.env.CLAWQL_MEMORY_BACKEND = "git";
    delete process.env.CLAWQL_MEMORY_CRYPTO_SHRED;
    expect(memoryCryptoShredEnabled()).toBe(true);
    process.env.CLAWQL_MEMORY_CRYPTO_SHRED = "0";
    expect(memoryCryptoShredEnabled()).toBe(false);
  });

  it("encrypt/decrypt round-trip; destroy key makes ciphertext unreadable", async () => {
    const vault = await freshVault();
    const noteId = "11111111-1111-4111-8111-111111111111";
    const key = await loadOrCreateNoteKey(vault, noteId);
    const plaintext = "patient jane-doe medical leave details";
    const envelope = encryptNoteBody({ plaintext, noteId, key });
    expect(isEncryptedVaultEnvelope(envelope)).toBe(true);
    expect(envelope).not.toContain("jane-doe");
    expect(decryptNoteBody({ envelope, key })).toBe(plaintext);

    expect(await destroyNoteKey(vault, noteId)).toBe(true);
    await expect(maybeDecryptVaultRead(vault, envelope)).rejects.toThrow(/crypto-shredded/);
  });

  it("maybeEncryptForVaultWrite stores ciphertext on disk path map + deny list", async () => {
    stash("CLAWQL_MEMORY_CRYPTO_SHRED");
    process.env.CLAWQL_MEMORY_CRYPTO_SHRED = "1";
    const vault = await freshVault();
    const rel = "Memory/team/secret-note.md";
    const body = "needle SECRET_TOKEN_XYZ body";
    const written = await maybeEncryptForVaultWrite(vault, rel, body);
    expect(written).toContain("CLAWQL_ENCRYPTED_V1:");
    expect(written).not.toContain("SECRET_TOKEN_XYZ");

    const entry = await upsertPathMapEntry(vault, { path: rel, contentHash: sha256Hex(body) });
    expect(entry.pathId).toMatch(/^[a-f0-9]{32}$/);
    expect(entry.path).toBe(rel);

    await appendErasureDeny(vault, {
      contentHash: sha256Hex(body),
      pathId: entry.pathId,
    });
    const denied = await loadErasureDenyHashes(vault);
    expect(denied.has(sha256Hex(body))).toBe(true);

    const removed = await deletePathMapEntry(vault, rel);
    expect(removed?.pathId).toBe(entry.pathId);
    const gi = await readFile(join(vault, ".gitignore"), "utf8");
    expect(gi).toContain(".clawql/");
  });
});
