/**
 * At-rest encryption + retention helpers for schedule projection snapshots.
 * Snapshots are third-party data: screen, redact like delivered diffs, encrypt, delete with lifecycle.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  MAX_PROJECTION_STORE_BYTES,
  screenStoredText,
} from "./change-detect.js";

const ENC_PREFIX = "enc1.";

function screenStoredValue(value: unknown): unknown {
  if (typeof value === "string") return screenStoredText(value);
  if (Array.isArray(value)) return value.map(screenStoredValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = screenStoredValue(v);
    }
    return out;
  }
  return value;
}

function resolveKeyMaterial(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.CLAWQL_SCHEDULE_PROJECTION_KEY?.trim();
  if (raw) {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
    return createHash("sha256").update(raw, "utf8").digest();
  }
  const dbPath = env.CLAWQL_SCHEDULE_DB_PATH?.trim();
  const keyPath = dbPath
    ? join(dirname(dbPath), "projection.key")
    : join(process.cwd(), ".clawql", "schedule", "projection.key");
  try {
    if (existsSync(keyPath)) {
      const existing = readFileSync(keyPath, "utf8").trim();
      if (/^[0-9a-fA-F]{64}$/.test(existing)) return Buffer.from(existing, "hex");
    }
  } catch {
    /* fall through to create */
  }
  const key = randomBytes(32);
  try {
    mkdirSync(dirname(keyPath), { recursive: true });
    writeFileSync(keyPath, key.toString("hex"), { mode: 0o600 });
  } catch {
    /* in-memory only for this process if filesystem unwritable */
  }
  return key;
}

/** Encrypt UTF-8 JSON for SQLite at-rest storage (AES-256-GCM). */
export function encryptProjectionJson(
  plaintext: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const key = resolveKeyMaterial(env);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString("base64url")}.${Buffer.concat([enc, tag]).toString("base64url")}`;
}

/** Decrypt stored blob; plain JSON (pre-encryption) passes through for migration. */
export function decryptProjectionJson(
  stored: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  if (!stored.startsWith(ENC_PREFIX)) return stored;
  const rest = stored.slice(ENC_PREFIX.length);
  const dot = rest.indexOf(".");
  if (dot < 0) throw new Error("invalid projection ciphertext");
  const iv = Buffer.from(rest.slice(0, dot), "base64url");
  const raw = Buffer.from(rest.slice(dot + 1), "base64url");
  if (raw.length < 16) throw new Error("projection ciphertext too short");
  const tag = raw.subarray(raw.length - 16);
  const data = raw.subarray(0, raw.length - 16);
  const key = resolveKeyMaterial(env);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function isEncryptedProjectionBlob(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.startsWith(ENC_PREFIX);
}

/**
 * Screen + gateway-redact (same path as delivered MCP Events) + encrypt for retention.
 * Returns null when over size budget.
 */
export async function prepareProjectionForStore(
  projection: unknown,
  env: NodeJS.ProcessEnv = process.env
): Promise<string | null> {
  const screened = screenStoredValue(projection);
  let redacted: unknown = screened;
  try {
    const { gatewayRedactPayload } = await import("clawql-api");
    redacted = await gatewayRedactPayload(screened);
  } catch {
    /* redaction optional if clawql-api unavailable */
  }
  const json = JSON.stringify(redacted);
  if (Buffer.byteLength(json, "utf8") > MAX_PROJECTION_STORE_BYTES) {
    return null;
  }
  return encryptProjectionJson(json, env);
}

/** Load plaintext projection object from DB blob (encrypted or legacy plain). */
export function loadStoredProjection(
  stored: string | null,
  env: NodeJS.ProcessEnv = process.env
): unknown | null {
  if (!stored) return null;
  try {
    const json = decryptProjectionJson(stored, env);
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

/** Plain JSON string for detectProjectedChange previousProjectionJson. */
export function loadStoredProjectionJson(
  stored: string | null,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (!stored) return null;
  try {
    return decryptProjectionJson(stored, env);
  } catch {
    return null;
  }
}
