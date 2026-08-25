/**
 * File-backed issued API key registry (enterprise team / org keys).
 * Path is chosen by the host (e.g. `$CLAWQL_HOME/Auth/api-keys.json`).
 *
 * Effect is the primary surface: {@link IssuedApiKeyStoreService} + {@link createIssuedApiKeyStoreLayer}
 * mirror {@link GatewayAuthService} / {@link IdJagIssuerService}. Mutating operations (issue / revoke /
 * the best-effort `lastUsedAt` touch) share one {@link Effect.Semaphore} permit per store instance so
 * concurrent issue/revoke never clobber the JSON file — an Effect-native replacement for a Promise chain
 * mutex.
 */

import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Context, Data, Effect, Layer } from "effect";

import {
  emitAuthEvent,
  noopAuthEventSink,
  type AuthEvent,
  type AuthEventSink,
} from "../audit/auth-events.js";
import type { AtrClaims, ApiKeyClaimsResolver } from "../gateway.js";
import {
  formatApiKeySecretEffect,
  generateApiKeyIdEffect,
  generateApiKeySaltEffect,
  generateApiKeySecretPartEffect,
  hashApiKeySecretEffect,
  hashesEqualEffect,
  parseApiKeySecretEffect,
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

/** Module-internal sync read; wrapped by {@link loadIssuedApiKeyStoreEffect}. */
function loadIssuedApiKeyStoreSync(path: string): IssuedApiKeyStoreFile {
  try {
    if (!existsSync(path)) return emptyStore();
    const parsed = JSON.parse(readFileSync(path, "utf8")) as IssuedApiKeyStoreFile;
    if (!parsed || typeof parsed !== "object") return emptyStore();
    return { version: 1, keys: Array.isArray(parsed.keys) ? parsed.keys : [] };
  } catch {
    return emptyStore();
  }
}

/** Effect: load the store file (never fails — a missing/corrupt file degrades to empty). */
export function loadIssuedApiKeyStoreEffect(path: string): Effect.Effect<IssuedApiKeyStoreFile> {
  return Effect.sync(() => loadIssuedApiKeyStoreSync(path));
}

/** Effect: persist the store file (`0o600`, parent directory created as needed). */
export function saveIssuedApiKeyStoreEffect(
  path: string,
  store: IssuedApiKeyStoreFile
): Effect.Effect<void, ApiKeyStoreError> {
  return Effect.tryPromise({
    try: async () => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    },
    catch: (cause) =>
      new ApiKeyStoreError({ reason: `Failed to save API key store: ${errMsg(cause)}`, cause }),
  });
}

/**
 * `auth-events.ts` still exposes a Promise-based `emitAuthEvent` — wrap with `Effect.tryPromise`
 * here. TODO(effect-ts-everywhere): switch to an `emitAuthEventEffect` once `audit/auth-events.ts`
 * grows one; re-check that file before assuming this wrapper is still needed.
 */
function emitEffect(sink: AuthEventSink, event: AuthEvent): Effect.Effect<void, ApiKeyStoreError> {
  return Effect.tryPromise({
    try: () => Promise.resolve(emitAuthEvent(sink, event)),
    catch: (cause) =>
      new ApiKeyStoreError({ reason: `Failed to emit auth event: ${errMsg(cause)}`, cause }),
  });
}

export type IssuedApiKeyStoreOptions = {
  path: string;
  eventSink?: AuthEventSink;
  /** Clock for tests. */
  now?: () => Date;
};

/**
 * Mutex-serialized mutations (single-permit `Effect.Semaphore`) so concurrent issue/revoke
 * don't clobber the JSON file.
 */
export class IssuedApiKeyStore {
  private readonly lock = Effect.unsafeMakeSemaphore(1);
  private readonly now: () => Date;
  private readonly eventSink: AuthEventSink;

  constructor(private readonly options: IssuedApiKeyStoreOptions) {
    this.now = options.now ?? (() => new Date());
    this.eventSink = options.eventSink ?? noopAuthEventSink;
  }

  get path(): string {
    return this.options.path;
  }

  private withLock<A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> {
    return this.lock.withPermits(1)(effect);
  }

  /** Fire an audit event on a detached daemon fiber — keeps callers (esp. sync-run `validate`) non-blocking. */
  private notify(event: AuthEvent): Effect.Effect<void> {
    return Effect.forkDaemon(
      emitEffect(this.eventSink, event).pipe(Effect.catchAll(() => Effect.void))
    ).pipe(Effect.asVoid);
  }

  load(): Effect.Effect<IssuedApiKeyStoreFile> {
    return loadIssuedApiKeyStoreEffect(this.options.path);
  }

  findById(id: string): Effect.Effect<IssuedApiKeyRecord | undefined> {
    return this.load().pipe(Effect.map((store) => store.keys.find((k) => k.id === id)));
  }

  listActive(filter?: { orgId?: string; teamId?: string }): Effect.Effect<IssuedApiKeyRecord[]> {
    return this.load().pipe(
      Effect.map((store) => {
        const nowMs = this.now().getTime();
        return store.keys.filter((k) => {
          if (k.revokedAt) return false;
          if (k.expiresAt && Date.parse(k.expiresAt) <= nowMs) return false;
          if (filter?.orgId && k.orgId !== filter.orgId) return false;
          if (filter?.teamId && k.teamId !== filter.teamId) return false;
          return true;
        });
      })
    );
  }

  issue(input: IssueApiKeyInput): Effect.Effect<IssueApiKeyResult, ApiKeyStoreError> {
    return this.withLock(
      Effect.gen(this, function* () {
        const store = yield* loadIssuedApiKeyStoreEffect(this.options.path);
        const id = yield* generateApiKeyIdEffect();
        const salt = yield* generateApiKeySaltEffect();
        const secretPart = yield* generateApiKeySecretPartEffect();
        const secret = yield* formatApiKeySecretEffect(id, secretPart);
        const secretHash = yield* hashApiKeySecretEffect(salt, secret);
        const expiresAt =
          input.expiresAt === undefined
            ? undefined
            : typeof input.expiresAt === "string"
              ? input.expiresAt
              : input.expiresAt.toISOString();

        const record: IssuedApiKeyRecord = {
          id,
          salt,
          secretHash,
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
        yield* saveIssuedApiKeyStoreEffect(this.options.path, store);

        yield* emitEffect(this.eventSink, {
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
      })
    );
  }

  /**
   * Validate a presented secret. Never fails — invalid presented secrets resolve to an
   * `{ ok: false, reason }` result, matching the pre-Effect sync API. The audit emit and
   * `lastUsedAt` touch run on a detached daemon fiber (`notify` / forked `touchLastUsed`) so this
   * Effect has no async suspension points and stays runnable via `Effect.runSync` — required by
   * {@link asClaimsResolver}, whose `ApiKeyClaimsResolver` shape (defined in `../gateway.ts`) is a
   * synchronous host boundary.
   */
  validate(presented: string): Effect.Effect<ValidateApiKeyResult> {
    return Effect.gen(this, function* () {
      const parsed = yield* parseApiKeySecretEffect(presented);
      if (!parsed) {
        yield* this.notify({
          type: "API_KEY_INVALID",
          reason: "bad_format",
          timestamp: this.now().toISOString(),
        });
        return { ok: false, reason: "bad_format" } as const;
      }

      const store = yield* loadIssuedApiKeyStoreEffect(this.options.path);
      const record = store.keys.find((k) => k.id === parsed.id);
      if (!record) {
        yield* this.notify({
          type: "API_KEY_INVALID",
          reason: "not_found",
          keyId: parsed.id,
          timestamp: this.now().toISOString(),
        });
        return { ok: false, reason: "not_found", keyId: parsed.id } as const;
      }

      if (record.revokedAt) {
        yield* this.notify({
          type: "API_KEY_INVALID",
          reason: "revoked",
          keyId: record.id,
          timestamp: this.now().toISOString(),
        });
        return { ok: false, reason: "revoked", keyId: record.id } as const;
      }

      if (record.expiresAt && Date.parse(record.expiresAt) <= this.now().getTime()) {
        yield* this.notify({
          type: "API_KEY_INVALID",
          reason: "expired",
          keyId: record.id,
          timestamp: this.now().toISOString(),
        });
        return { ok: false, reason: "expired", keyId: record.id } as const;
      }

      const hash = yield* hashApiKeySecretEffect(record.salt, parsed.raw);
      const matches = yield* hashesEqualEffect(hash, record.secretHash);
      if (!matches) {
        yield* this.notify({
          type: "API_KEY_INVALID",
          reason: "hash_mismatch",
          keyId: record.id,
          timestamp: this.now().toISOString(),
        });
        return { ok: false, reason: "hash_mismatch", keyId: record.id } as const;
      }

      yield* Effect.forkDaemon(
        this.touchLastUsed(record.id).pipe(Effect.catchAll(() => Effect.void))
      );
      yield* this.notify({
        type: "API_KEY_USED",
        keyId: record.id,
        orgId: record.orgId,
        teamId: record.teamId,
        subjectId: record.subjectId,
        timestamp: this.now().toISOString(),
      });

      return { ok: true, record } as const;
    });
  }

  /** Best-effort `lastUsedAt` update — fire-and-forget from {@link validate}, mutex-serialized. */
  private touchLastUsed(keyId: string): Effect.Effect<void, ApiKeyStoreError> {
    return this.withLock(
      Effect.gen(this, function* () {
        const store = yield* loadIssuedApiKeyStoreEffect(this.options.path);
        const key = store.keys.find((k) => k.id === keyId);
        if (!key) return;
        key.lastUsedAt = this.now().toISOString();
        yield* saveIssuedApiKeyStoreEffect(this.options.path, store);
      })
    );
  }

  revoke(keyId: string): Effect.Effect<IssuedApiKeyRecord | null, ApiKeyStoreError> {
    return this.withLock(
      Effect.gen(this, function* () {
        const store = yield* loadIssuedApiKeyStoreEffect(this.options.path);
        const key = store.keys.find((k) => k.id === keyId);
        if (!key) return null;
        if (!key.revokedAt) {
          key.revokedAt = this.now().toISOString();
          yield* saveIssuedApiKeyStoreEffect(this.options.path, store);
          yield* emitEffect(this.eventSink, {
            type: "API_KEY_REVOKED",
            keyId: key.id,
            orgId: key.orgId,
            teamId: key.teamId,
            timestamp: key.revokedAt,
          });
        }
        return key;
      })
    );
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
   * Sync {@link ApiKeyClaimsResolver} for gateway `apiKey` mode — a forced host boundary
   * (`../gateway.ts`'s `resolveAtrClaimsFromHeaders` is synchronous). This thin façade runs
   * {@link validate}'s sync-safe Effect via `Effect.runSync`.
   * Returns `null` when the presented string is not an issued `cqk_` key
   * (so static `CLAWQL_API_KEY` / other resolvers can still match).
   */
  asClaimsResolver(): ApiKeyClaimsResolver {
    return (presented) => {
      const parsed = Effect.runSync(parseApiKeySecretEffect(presented));
      if (!parsed) return null;
      const result = Effect.runSync(this.validate(presented));
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

export class IssuedApiKeyStoreService extends Context.Tag("clawql/IssuedApiKeyStoreService")<
  IssuedApiKeyStoreService,
  {
    readonly path: string;
    readonly load: () => Effect.Effect<IssuedApiKeyStoreFile>;
    readonly findById: (id: string) => Effect.Effect<IssuedApiKeyRecord | undefined>;
    readonly listActive: (filter?: {
      orgId?: string;
      teamId?: string;
    }) => Effect.Effect<IssuedApiKeyRecord[]>;
    readonly issue: (input: IssueApiKeyInput) => Effect.Effect<IssueApiKeyResult, ApiKeyStoreError>;
    readonly validate: (presented: string) => Effect.Effect<ValidateApiKeyResult>;
    readonly revoke: (keyId: string) => Effect.Effect<IssuedApiKeyRecord | null, ApiKeyStoreError>;
    readonly toAtrClaims: (record: IssuedApiKeyRecord) => AtrClaims;
    readonly asClaimsResolver: () => ApiKeyClaimsResolver;
  }
>() {}

export function issuedApiKeyStoreServiceFromStore(
  store: IssuedApiKeyStore
): IssuedApiKeyStoreService["Type"] {
  return IssuedApiKeyStoreService.of({
    path: store.path,
    load: () => store.load(),
    findById: (id) => store.findById(id),
    listActive: (filter) => store.listActive(filter),
    issue: (input) => store.issue(input),
    validate: (presented) => store.validate(presented),
    revoke: (keyId) => store.revoke(keyId),
    toAtrClaims: (record) => store.toAtrClaims(record),
    asClaimsResolver: () => store.asClaimsResolver(),
  });
}

/** Build an isolated issued-API-key store service layer for a given path (mirrors `createIdJagIssuerLayer`). */
export function createIssuedApiKeyStoreLayer(
  options: IssuedApiKeyStoreOptions
): Layer.Layer<IssuedApiKeyStoreService> {
  return Layer.succeed(
    IssuedApiKeyStoreService,
    issuedApiKeyStoreServiceFromStore(createIssuedApiKeyStore(options))
  );
}

/** Effect helper kept for call sites holding a store instance directly (thin pass-through). */
export function issueApiKeyEffect(
  store: IssuedApiKeyStore,
  input: IssueApiKeyInput
): Effect.Effect<IssueApiKeyResult, ApiKeyStoreError> {
  return store.issue(input);
}

/** Effect helper: validate and fail with {@link ApiKeyStoreError} when the key is not ok. */
export function validateApiKeyEffect(
  store: IssuedApiKeyStore,
  presented: string
): Effect.Effect<IssuedApiKeyRecord, ApiKeyStoreError> {
  return store
    .validate(presented)
    .pipe(
      Effect.flatMap((result) =>
        result.ok
          ? Effect.succeed(result.record)
          : Effect.fail(new ApiKeyStoreError({ reason: `API key invalid: ${result.reason}` }))
      )
    );
}
