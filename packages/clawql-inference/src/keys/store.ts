import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Context, Effect, Layer } from "effect";
import { loadKeysConfig, resolveVirtualKeysPath } from "./config.js";
import { parseRateLimit } from "./rate-limit.js";
import type { RateLimitSpec, VirtualKey, VirtualKeyStoreFile } from "./types.js";

export function hashVirtualKeySecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function generateVirtualKeyId(): string {
  return `vk_${randomBytes(8).toString("hex")}`;
}

export function generateVirtualKeySecret(): string {
  return `clawql-vk-${randomBytes(24).toString("base64url")}`;
}

function emptyStore(): VirtualKeyStoreFile {
  return { keys: [] };
}

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

export function loadVirtualKeyStoreSync(env: NodeJS.ProcessEnv = process.env): VirtualKeyStoreFile {
  try {
    const path = resolveVirtualKeysPath(env);
    if (!existsSync(path)) return emptyStore();
    const parsed = JSON.parse(readFileSync(path, "utf8")) as VirtualKeyStoreFile;
    return { keys: parsed.keys ?? [] };
  } catch {
    return emptyStore();
  }
}

export function saveVirtualKeyStoreEffect(
  store: VirtualKeyStoreFile,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string, Error> {
  return Effect.tryPromise({
    try: async () => {
      const path = resolveVirtualKeysPath(env);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, "utf8");
      return path;
    },
    catch: asError,
  });
}

/** Promise façade. */
export async function saveVirtualKeyStore(
  store: VirtualKeyStoreFile,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  return Effect.runPromise(saveVirtualKeyStoreEffect(store, env));
}

export function findKeyBySecret(
  store: VirtualKeyStoreFile,
  secret: string
): VirtualKey | undefined {
  const hash = hashVirtualKeySecret(secret);
  return store.keys.find((k) => k.secretHash === hash && !k.revokedAt);
}

export function findKeyById(store: VirtualKeyStoreFile, id: string): VirtualKey | undefined {
  return store.keys.find((k) => k.id === id);
}

export type CreateVirtualKeyInput = {
  team: string;
  label?: string;
  budgetUsd?: number;
  rateLimit?: string;
  memoryEnrichment?: boolean;
  memoryScope?: string;
};

export type CreateVirtualKeyResult = {
  key: VirtualKey;
  secret: string;
  path: string;
};

export function createVirtualKeyEffect(
  input: CreateVirtualKeyInput,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<CreateVirtualKeyResult, Error> {
  return Effect.gen(function* () {
    const store = loadVirtualKeyStoreSync(env);
    const secret = generateVirtualKeySecret();
    const rateLimit = parseRateLimit(input.rateLimit);
    const key: VirtualKey = {
      id: generateVirtualKeyId(),
      team: input.team.trim(),
      label: input.label?.trim() || undefined,
      secretHash: hashVirtualKeySecret(secret),
      budgetUsd: input.budgetUsd,
      spentUsd: 0,
      rateLimit,
      memoryEnrichment: input.memoryEnrichment === true ? true : undefined,
      memoryScope: input.memoryScope?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    store.keys.push(key);
    const path = yield* saveVirtualKeyStoreEffect(store, env);
    return { key, secret, path };
  });
}

/** Promise façade. */
export async function createVirtualKey(
  input: CreateVirtualKeyInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<CreateVirtualKeyResult> {
  return Effect.runPromise(createVirtualKeyEffect(input, env));
}

export function revokeVirtualKeyEffect(
  id: string,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<{ key: VirtualKey; path: string } | null, Error> {
  return Effect.gen(function* () {
    const store = loadVirtualKeyStoreSync(env);
    const key = findKeyById(store, id);
    if (!key) return null;
    key.revokedAt = new Date().toISOString();
    const path = yield* saveVirtualKeyStoreEffect(store, env);
    return { key, path };
  });
}

/** Promise façade. */
export async function revokeVirtualKey(
  id: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ key: VirtualKey; path: string } | null> {
  return Effect.runPromise(revokeVirtualKeyEffect(id, env));
}

export function recordKeySpendEffect(
  keyId: string,
  amountUsd: number,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    if (amountUsd <= 0) return;
    const store = loadVirtualKeyStoreSync(env);
    const key = findKeyById(store, keyId);
    if (!key) return;
    key.spentUsd += amountUsd;
    yield* saveVirtualKeyStoreEffect(store, env);
  });
}

/** Promise façade. */
export async function recordKeySpend(
  keyId: string,
  amountUsd: number,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  return Effect.runPromise(recordKeySpendEffect(keyId, amountUsd, env));
}

export function listVirtualKeys(env: NodeJS.ProcessEnv = process.env): VirtualKey[] {
  return loadVirtualKeyStoreSync(env).keys;
}

export function keysEnforcementActive(env: NodeJS.ProcessEnv = process.env): boolean {
  const config = loadKeysConfig(env);
  if (config.enabled) return true;
  const store = loadVirtualKeyStoreSync(env);
  return store.keys.some((k) => !k.revokedAt);
}

export function redactVirtualKey(key: VirtualKey): Omit<VirtualKey, "secretHash"> & {
  secretHash: undefined;
  rateLimit?: RateLimitSpec;
} {
  const { secretHash: _secretHash, ...rest } = key;
  return { ...rest, secretHash: undefined };
}

/** Effect service for virtual-key persistence. */
export class VirtualKeyStoreService extends Context.Service<VirtualKeyStoreService, {
    readonly save: (
      store: VirtualKeyStoreFile,
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<string, Error>;
    readonly create: (
      input: CreateVirtualKeyInput,
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<CreateVirtualKeyResult, Error>;
    readonly revoke: (
      id: string,
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<{ key: VirtualKey; path: string } | null, Error>;
    readonly recordSpend: (
      keyId: string,
      amountUsd: number,
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<void, Error>;
  }>()("clawql/VirtualKeyStoreService") {}

export function virtualKeyStoreLiveLayer(): Layer.Layer<VirtualKeyStoreService> {
  return Layer.succeed(
    VirtualKeyStoreService,
    VirtualKeyStoreService.of({
      save: saveVirtualKeyStoreEffect,
      create: createVirtualKeyEffect,
      revoke: revokeVirtualKeyEffect,
      recordSpend: recordKeySpendEffect,
    })
  );
}
