/**
 * At-rest encryption + retention helpers for schedule projection snapshots.
 * Snapshots are third-party data: screen, redact like delivered diffs, encrypt, delete with lifecycle.
 *
 * Production: key MUST come from env / Vault (`CLAWQL_SCHEDULE_PROJECTION_KEY` or
 * `CLAWQL_SECRET_SCHEDULE_PROJECTION_KEY`). Auto-generated keys beside the DB are
 * development-only — colocated ciphertext + key defeats encryption.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { MAX_PROJECTION_STORE_BYTES, screenStoredText } from "./change-detect.js";

const ENC_PREFIX = "enc1.";

export class ProjectionKeyError extends Error {
  readonly code = "SCHEDULE_PROJECTION_KEY_MISSING" as const;
  constructor(message: string) {
    super(message);
    this.name = "ProjectionKeyError";
  }
}

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

export function isProductionProjectionEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const node = env.NODE_ENV?.trim().toLowerCase();
  const claw = env.CLAWQL_ENV?.trim().toLowerCase();
  return node === "production" || claw === "production" || claw === "prod";
}

export function isProjectionKeyStrict(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isProductionProjectionEnv(env)) return true;
  const raw = env.CLAWQL_SCHEDULE_PROJECTION_KEY_STRICT?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Env / Vault-style secret material (never a file beside the schedule DB). */
export function readConfiguredProjectionKeyRaw(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const direct = env.CLAWQL_SCHEDULE_PROJECTION_KEY?.trim();
  if (direct) return direct;
  // Env secret-store convention (CLAWQL_SECRET_<PATH>)
  const viaSecret = env.CLAWQL_SECRET_SCHEDULE_PROJECTION_KEY?.trim();
  if (viaSecret) return viaSecret;
  return null;
}

function materializeKey(raw: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  return createHash("sha256").update(raw, "utf8").digest();
}

let warnedDevFileKey = false;

function resolveDevFileKey(env: NodeJS.ProcessEnv): Buffer {
  const dbPath = env.CLAWQL_SCHEDULE_DB_PATH?.trim();
  const keyPath = dbPath
    ? join(dirname(dbPath), "projection.key")
    : join(process.cwd(), ".clawql", "schedule", "projection.key");
  try {
    if (existsSync(keyPath)) {
      const existing = readFileSync(keyPath, "utf8").trim();
      if (/^[0-9a-fA-F]{64}$/.test(existing)) {
        if (!warnedDevFileKey) {
          warnedDevFileKey = true;
          console.warn(
            `[clawql-schedule] Using development projection key file at ${keyPath}. ` +
              `In production set CLAWQL_SCHEDULE_PROJECTION_KEY (or CLAWQL_SECRET_SCHEDULE_PROJECTION_KEY / Vault).`
          );
        }
        return Buffer.from(existing, "hex");
      }
    }
  } catch {
    /* fall through */
  }
  const key = randomBytes(32);
  try {
    mkdirSync(dirname(keyPath), { recursive: true });
    writeFileSync(keyPath, key.toString("hex"), { mode: 0o600 });
  } catch {
    /* in-memory only */
  }
  if (!warnedDevFileKey) {
    warnedDevFileKey = true;
    console.warn(
      `[clawql-schedule] Generated development projection key at ${keyPath}. ` +
        `Do not use file-beside-DB keys in production — set CLAWQL_SCHEDULE_PROJECTION_KEY.`
    );
  }
  return key;
}

/**
 * Resolve AES key material.
 * @throws {ProjectionKeyError} in production / strict mode when no env/Vault key is configured.
 */
export function resolveKeyMaterial(env: NodeJS.ProcessEnv = process.env): Buffer {
  const configured = readConfiguredProjectionKeyRaw(env);
  if (configured) return materializeKey(configured);

  if (isProjectionKeyStrict(env)) {
    throw new ProjectionKeyError(
      "CLAWQL_SCHEDULE_PROJECTION_KEY (or CLAWQL_SECRET_SCHEDULE_PROJECTION_KEY) is required in production. " +
        "Refusing file-beside-DB keys — ciphertext and key on the same disk are not encryption."
    );
  }
  return resolveDevFileKey(env);
}

/**
 * Boot / worker guard. Fail closed when strict; otherwise warn once if only file keys would be used.
 */
export function assertScheduleProjectionKeyConfigured(
  env: NodeJS.ProcessEnv = process.env
): { ok: true; source: "env" | "dev_file" } | { ok: false; reason: string } {
  if (readConfiguredProjectionKeyRaw(env)) {
    return { ok: true, source: "env" };
  }
  const reason =
    "CLAWQL_SCHEDULE_PROJECTION_KEY (or CLAWQL_SECRET_SCHEDULE_PROJECTION_KEY) not set — " +
    "projection snapshots cannot be encrypted safely in production (key must not sit beside the DB)";
  if (isProjectionKeyStrict(env)) {
    console.error(`[clawql-schedule] FATAL: ${reason}`);
    return { ok: false, reason };
  }
  console.warn(
    `[clawql-schedule] WARNING: ${reason}. Development file-beside-DB key fallback is active.`
  );
  return { ok: true, source: "dev_file" };
}

/** Reset one-shot warn flag (tests). */
export function resetProjectionKeyWarnForTests(): void {
  warnedDevFileKey = false;
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
