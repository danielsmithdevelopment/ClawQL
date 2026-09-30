import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Effect } from "effect";
import type { StoredSubscription } from "./types.js";

export type SubscriptionStore = {
  readonly get: (id: string) => Effect.Effect<StoredSubscription | undefined>;
  readonly upsert: (sub: StoredSubscription) => Effect.Effect<void>;
  readonly remove: (id: string) => Effect.Effect<void>;
  readonly list: () => Effect.Effect<readonly StoredSubscription[]>;
  readonly findByIdentity: (id: string) => Effect.Effect<StoredSubscription | undefined>;
};

type StoreFile = { version: 1; subscriptions: StoredSubscription[] };

function defaultStorePath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.CLAWQL_MCP_EVENTS_STORE_PATH?.trim();
  if (override) return override;
  return join(process.cwd(), ".clawql", "mcp-events", "subscriptions.json");
}

function isExpired(sub: StoredSubscription, now = Date.now()): boolean {
  if (sub.refreshBefore == null) return false;
  return Date.parse(sub.refreshBefore) <= now;
}

export function createMemorySubscriptionStore(
  initial: StoredSubscription[] = []
): SubscriptionStore {
  const map = new Map<string, StoredSubscription>(initial.map((s) => [s.id, s]));
  return {
    get: (id) =>
      Effect.sync(() => {
        const s = map.get(id);
        if (!s || isExpired(s)) {
          if (s) map.delete(id);
          return undefined;
        }
        return s;
      }),
    upsert: (sub) =>
      Effect.sync(() => {
        map.set(sub.id, sub);
      }),
    remove: (id) =>
      Effect.sync(() => {
        map.delete(id);
      }),
    list: () =>
      Effect.sync(() => {
        const now = Date.now();
        for (const [id, s] of map) {
          if (isExpired(s, now)) map.delete(id);
        }
        return [...map.values()];
      }),
    findByIdentity: (id) =>
      Effect.sync(() => {
        const s = map.get(id);
        if (!s || isExpired(s)) {
          if (s) map.delete(id);
          return undefined;
        }
        return s;
      }),
  };
}

export function createFileSubscriptionStore(
  path: string = defaultStorePath()
): SubscriptionStore {
  let cache: Map<string, StoredSubscription> | null = null;

  const load = (): Effect.Effect<Map<string, StoredSubscription>> =>
    Effect.tryPromise({
      try: async () => {
        if (cache) return cache;
        try {
          const raw = await readFile(path, "utf8");
          const parsed = JSON.parse(raw) as StoreFile;
          const map = new Map<string, StoredSubscription>();
          const now = Date.now();
          for (const s of parsed.subscriptions ?? []) {
            if (!isExpired(s, now)) map.set(s.id, s);
          }
          cache = map;
          return map;
        } catch (e) {
          const err = e as NodeJS.ErrnoException;
          if (err.code === "ENOENT") {
            cache = new Map();
            return cache;
          }
          throw e;
        }
      },
      catch: (e) => e as Error,
    }).pipe(Effect.orDie);

  const persist = (map: Map<string, StoredSubscription>): Effect.Effect<void> =>
    Effect.tryPromise({
      try: async () => {
        await mkdir(dirname(path), { recursive: true });
        const body: StoreFile = {
          version: 1,
          subscriptions: [...map.values()],
        };
        const tmp = `${path}.${process.pid}.tmp`;
        await writeFile(tmp, JSON.stringify(body, null, 2), "utf8");
        await rename(tmp, path);
        cache = map;
      },
      catch: (e) => e as Error,
    }).pipe(Effect.orDie);

  return {
    get: (id) =>
      Effect.gen(function* () {
        const map = yield* load();
        const s = map.get(id);
        if (!s || isExpired(s)) {
          if (s) {
            map.delete(id);
            yield* persist(map);
          }
          return undefined;
        }
        return s;
      }),
    upsert: (sub) =>
      Effect.gen(function* () {
        const map = yield* load();
        map.set(sub.id, sub);
        yield* persist(map);
      }),
    remove: (id) =>
      Effect.gen(function* () {
        const map = yield* load();
        if (map.delete(id)) yield* persist(map);
      }),
    list: () =>
      Effect.gen(function* () {
        const map = yield* load();
        const now = Date.now();
        let dirty = false;
        for (const [id, s] of map) {
          if (isExpired(s, now)) {
            map.delete(id);
            dirty = true;
          }
        }
        if (dirty) yield* persist(map);
        return [...map.values()];
      }),
    findByIdentity: (id) =>
      Effect.gen(function* () {
        const map = yield* load();
        const s = map.get(id);
        if (!s || isExpired(s)) {
          if (s) {
            map.delete(id);
            yield* persist(map);
          }
          return undefined;
        }
        return s;
      }),
  };
}

export function resolveDefaultStorePath(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string> {
  return Effect.sync(() => defaultStorePath(env));
}
