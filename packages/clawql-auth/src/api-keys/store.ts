/**
 * File-backed issued API key registry (enterprise team / org keys).
 * Path is chosen by the host (e.g. `$CLAWQL_HOME/Auth/api-keys.json`).
 */

import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Data, Effect } from "effect";

import { emitAuthEvent, noopAuthEventSink, type AuthEventSink } from "../audit/auth-events.js";
import type { AtrClaims, ApiKeyClaimsResolver } from "../gateway.js";
import {
  formatApiKeySecret,
  generateApiKeyId,
  generateApiKeySalt,
  generateApiKeySecretPart,
  hashApiKeySecret,
  hashesEqual,
  parseApiKeySecret,
} from "./crypto.js";
import type {
  IssueApiKeyInput,
  IssueApiKeyResult,
  IssuedApiKeyRecord,
  IssuedApiKeyStoreFile,
  ValidateApiKeyResult,
} from "./types.js";

export class ApiKeyStoreError extends Data.TaggedError("ApiKeyStoreError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

function emptyStore(): IssuedApiKeyStoreFile {
  return { version: 1, keys: [] };
}

function errMsg(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function loadIssuedApiKeyStoreSync(path: string): IssuedApiKeyStoreFile {
  try {
    if (!existsSync(path)) return emptyStore();
    const parsed = JSON.parse(readFileSync(path, "utf8")) as IssuedApiKeyStoreFile;
    if (!parsed || typeof parsed !== "object") return emptyStore();
    return { version: 1, keys: Array.isArray(parsed.keys) ? parsed.keys : [] };
  } catch {
    return emptyStore();
  }
}

export async function saveIssuedApiKeyStore(
  path: string,
  store: IssuedApiKeyStoreFile
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
}

export type IssuedApiKeyStoreOptions = {
  path: string;
  eventSink?: AuthEventSink;
  /** Clock for tests. */
  now?: () => Date;
};

/**
 * Mutex-serialized mutations so concurrent issue/revoke don't clobber the JSON file.
 */
export class IssuedApiKeyStore {
  private writeChain: Promise<unknown> = Promise.resolve();
  private readonly now: () => Date;
  private readonly eventSink: AuthEventSink;

  constructor(private readonly options: IssuedApiKeyStoreOptions) {
    this.now = options.now ?? (() => new Date());
    this.eventSink = options.eventSink ?? noopAuthEventSink;
  }

  get path(): string {
    return this.options.path;
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeChain.then(fn, fn);
    this.writeChain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  load(): IssuedApiKeyStoreFile {
    return loadIssuedApiKeyStoreSync(this.options.path);
  }

  findById(id: string): IssuedApiKeyRecord | undefined {
    return this.load().keys.find((k) => k.id === id);
  }

  listActive(filter?: { orgId?: string; teamId?: string }): IssuedApiKeyRecord[] {
    const nowMs = this.now().getTime();
    return this.load().keys.filter((k) => {
      if (k.revokedAt) return false;
      if (k.expiresAt && Date.parse(k.expiresAt) <= nowMs) return false;
      if (filter?.orgId && k.orgId !== filter.orgId) return false;
      if (filter?.teamId && k.teamId !== filter.teamId) return false;
      return true;
    });
  }

  async issue(input: IssueApiKeyInput): Promise<IssueApiKeyResult> {
    return this.enqueue(async () => {
      const store = loadIssuedApiKeyStoreSync(this.options.path);
      const id = generateApiKeyId();
      const salt = generateApiKeySalt();
      const secretPart = generateApiKeySecretPart();
      const secret = formatApiKeySecret(id, secretPart);
      const expiresAt =
        input.expiresAt === undefined
          ? undefined
          : typeof input.expiresAt === "string"
            ? input.expiresAt
            : input.expiresAt.toISOString();

      const record: IssuedApiKeyRecord = {
        id,
        salt,
        secretHash: hashApiKeySecret(salt, secret),
        subjectId: input.subjectId.trim(),
        role: (input.role ?? "operator").trim(),
        scope: input.scope?.length ? [...input.scope] : ["execute", "search", "memory"],
        orgId: input.orgId?.trim() || undefined,
        teamId: input.teamId?.trim() || undefined,
        label: input.label?.trim() || undefined,
        createdAt: this.now().toISOString(),
        expiresAt,
      };

      store.keys.push(record);
      await saveIssuedApiKeyStore(this.options.path, store);

      await emitAuthEvent(this.eventSink, {
        type: "API_KEY_ISSUED",
        keyId: record.id,
        orgId: record.orgId,
        teamId: record.teamId,
        subjectId: record.subjectId,
        role: record.role,
        scope: record.scope,
        timestamp: record.createdAt,
      });

      return { record, secret };
    });
  }

  /**
   * Validate a presented secret. Updates `lastUsedAt` on success (best-effort async).
   */
  validate(presented: string): ValidateApiKeyResult {
    const parsed = parseApiKeySecret(presented);
    if (!parsed) {
      void emitAuthEvent(this.eventSink, {
        type: "API_KEY_INVALID",
        reason: "bad_format",
        timestamp: this.now().toISOString(),
      });
      return { ok: false, reason: "bad_format" };
    }

    const record = this.findById(parsed.id);
    if (!record) {
      void emitAuthEvent(this.eventSink, {
        type: "API_KEY_INVALID",
        reason: "not_found",
        keyId: parsed.id,
        timestamp: this.now().toISOString(),
      });
      return { ok: false, reason: "not_found", keyId: parsed.id };
    }

    if (record.revokedAt) {
      void emitAuthEvent(this.eventSink, {
        type: "API_KEY_INVALID",
        reason: "revoked",
        keyId: record.id,
        timestamp: this.now().toISOString(),
      });
      return { ok: false, reason: "revoked", keyId: record.id };
    }

    if (record.expiresAt && Date.parse(record.expiresAt) <= this.now().getTime()) {
      void emitAuthEvent(this.eventSink, {
        type: "API_KEY_INVALID",
        reason: "expired",
        keyId: record.id,
        timestamp: this.now().toISOString(),
      });
      return { ok: false, reason: "expired", keyId: record.id };
    }

    const hash = hashApiKeySecret(record.salt, parsed.raw);
    if (!hashesEqual(hash, record.secretHash)) {
      void emitAuthEvent(this.eventSink, {
        type: "API_KEY_INVALID",
        reason: "hash_mismatch",
        keyId: record.id,
        timestamp: this.now().toISOString(),
      });
      return { ok: false, reason: "hash_mismatch", keyId: record.id };
    }

    void this.touchLastUsed(record.id);

    void emitAuthEvent(this.eventSink, {
      type: "API_KEY_USED",
      keyId: record.id,
      orgId: record.orgId,
      teamId: record.teamId,
      subjectId: record.subjectId,
      timestamp: this.now().toISOString(),
    });

    return { ok: true, record };
  }

  private async touchLastUsed(keyId: string): Promise<void> {
    await this.enqueue(async () => {
      const store = loadIssuedApiKeyStoreSync(this.options.path);
      const key = store.keys.find((k) => k.id === keyId);
      if (!key) return;
      key.lastUsedAt = this.now().toISOString();
      await saveIssuedApiKeyStore(this.options.path, store);
    });
  }

  async revoke(keyId: string): Promise<IssuedApiKeyRecord | null> {
    return this.enqueue(async () => {
      const store = loadIssuedApiKeyStoreSync(this.options.path);
      const key = store.keys.find((k) => k.id === keyId);
      if (!key) return null;
      if (!key.revokedAt) {
        key.revokedAt = this.now().toISOString();
        await saveIssuedApiKeyStore(this.options.path, store);
        await emitAuthEvent(this.eventSink, {
          type: "API_KEY_REVOKED",
          keyId: key.id,
          orgId: key.orgId,
          teamId: key.teamId,
          timestamp: key.revokedAt,
        });
      }
      return key;
    });
  }

  /** Map a valid record to gateway ATR claims. */
  toAtrClaims(record: IssuedApiKeyRecord): AtrClaims {
    return {
      sub: record.subjectId,
      role: record.role,
      scope: [...record.scope],
      tenantId: record.orgId,
      orgId: record.orgId,
      virtualKeyId: record.id,
    };
  }

  /**
   * Sync {@link ApiKeyClaimsResolver} for gateway `apiKey` mode.
   * Returns `null` when the presented string is not an issued `cqk_` key
   * (so static `CLAWQL_API_KEY` / other resolvers can still match).
   */
  asClaimsResolver(): ApiKeyClaimsResolver {
    return (presented) => {
      const parsed = parseApiKeySecret(presented);
      if (!parsed) return null;
      const result = this.validate(presented);
      if (!result.ok) {
        return { ok: false, error: `Issued API key rejected: ${result.reason}` };
      }
      return { ok: true, claims: this.toAtrClaims(result.record) };
    };
  }
}

export function createIssuedApiKeyStore(options: IssuedApiKeyStoreOptions): IssuedApiKeyStore {
  return new IssuedApiKeyStore(options);
}

/** Effect helper: issue a key (thin wrapper for hosts that prefer Effect). */
export function issueApiKeyEffect(
  store: IssuedApiKeyStore,
  input: IssueApiKeyInput
): Effect.Effect<IssueApiKeyResult, ApiKeyStoreError> {
  return Effect.tryPromise({
    try: () => store.issue(input),
    catch: (cause) =>
      new ApiKeyStoreError({ reason: `Failed to issue API key: ${errMsg(cause)}`, cause }),
  });
}

export function validateApiKeyEffect(
  store: IssuedApiKeyStore,
  presented: string
): Effect.Effect<IssuedApiKeyRecord, ApiKeyStoreError> {
  return Effect.try({
    try: () => {
      const result = store.validate(presented);
      if (!result.ok) {
        throw new ApiKeyStoreError({
          reason: `API key invalid: ${result.reason}`,
        });
      }
      return result.record;
    },
    catch: (cause) =>
      cause instanceof ApiKeyStoreError
        ? cause
        : new ApiKeyStoreError({ reason: `API key validation failed: ${errMsg(cause)}`, cause }),
  });
}
