/**
 * Org-scoped gateway registry — Effect Tag + Layer.
 * Persistence: $CLAWQL_HOME/network/registry/orgs/<orgId>/gateways.json
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Context, Effect, Layer } from "effect";
import { defaultClawqlHome, networkRoot } from "../internal/paths.js";
import {
  GATEWAY_DEGRADED_AFTER_MISSED,
  GATEWAY_HEARTBEAT_INTERVAL_MS,
  GATEWAY_OFFLINE_AFTER_MISSED,
  type GatewayRecord,
  type GatewayStatus,
  type RegisterGatewayInput,
} from "./types.js";

export type GatewayRegistryFile = {
  readonly version: 1;
  readonly gateways: Record<string, GatewayRecord>;
};

export class GatewayRegistryService extends Context.Tag("clawql-network/GatewayRegistryService")<
  GatewayRegistryService,
  {
    readonly registerGateway: (input: RegisterGatewayInput) => Effect.Effect<GatewayRecord>;
    readonly heartbeat: (gatewayId: string, orgId: string) => Effect.Effect<GatewayRecord | null>;
    readonly listMeshPeers: (orgId: string) => Effect.Effect<readonly GatewayRecord[]>;
  }
>() {}

export const gatewayRegistryPath = (orgId: string, home?: string): string =>
  join(networkRoot(home ?? defaultClawqlHome()), "registry", "orgs", orgId, "gateways.json");

export const statusFromLastSeen = (
  lastSeenIso: string,
  nowMs: number = Date.now(),
  intervalMs: number = GATEWAY_HEARTBEAT_INTERVAL_MS
): GatewayStatus => {
  const last = Date.parse(lastSeenIso);
  if (!Number.isFinite(last)) return "offline";
  const missed = (nowMs - last) / intervalMs;
  if (missed <= GATEWAY_DEGRADED_AFTER_MISSED) return "healthy";
  if (missed <= GATEWAY_OFFLINE_AFTER_MISSED) return "degraded";
  return "offline";
};

const emptyFile = (): GatewayRegistryFile => ({ version: 1, gateways: {} });

const loadFile = (path: string): Effect.Effect<GatewayRegistryFile> =>
  Effect.tryPromise({
    try: async () => {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as GatewayRegistryFile;
      if (!parsed || typeof parsed !== "object" || !parsed.gateways) return emptyFile();
      return { version: 1 as const, gateways: parsed.gateways };
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  }).pipe(Effect.catchAll(() => Effect.succeed(emptyFile())));

const saveFile = (path: string, file: GatewayRegistryFile): Effect.Effect<void> =>
  Effect.tryPromise({
    try: async () => {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  }).pipe(Effect.catchAll(() => Effect.void));

const refreshStatuses = (file: GatewayRegistryFile, nowMs: number): GatewayRegistryFile => {
  const gateways: Record<string, GatewayRecord> = {};
  for (const [id, g] of Object.entries(file.gateways)) {
    gateways[id] = { ...g, status: statusFromLastSeen(g.lastSeen, nowMs) };
  }
  return { version: 1, gateways };
};

export const gatewayRegistryLiveLayer = (home?: string): Layer.Layer<GatewayRegistryService> =>
  Layer.succeed(GatewayRegistryService, {
    registerGateway: (input) =>
      Effect.gen(function* () {
        const orgId = input.orgId.trim();
        const gatewayId = input.gatewayId.trim();
        if (!orgId || !gatewayId) {
          return yield* Effect.die(new Error("registerGateway requires orgId and gatewayId"));
        }
        const path = gatewayRegistryPath(orgId, home);
        const now = new Date().toISOString();
        const file = yield* loadFile(path);
        const record: GatewayRecord = {
          gatewayId,
          orgId,
          kind: input.kind,
          meshIdentity: input.meshIdentity.trim(),
          ownerDeveloper:
            input.kind === "edge" ? input.ownerDeveloper?.trim() || undefined : undefined,
          lastSeen: now,
          status: "healthy",
        };
        const next: GatewayRegistryFile = {
          version: 1,
          gateways: { ...file.gateways, [gatewayId]: record },
        };
        yield* saveFile(path, next);
        return record;
      }),

    heartbeat: (gatewayId, orgId) =>
      Effect.gen(function* () {
        const path = gatewayRegistryPath(orgId.trim(), home);
        const file = yield* loadFile(path);
        const existing = file.gateways[gatewayId.trim()];
        if (!existing) return null;
        const now = new Date().toISOString();
        const record: GatewayRecord = {
          ...existing,
          lastSeen: now,
          status: "healthy",
        };
        yield* saveFile(path, {
          version: 1,
          gateways: { ...file.gateways, [record.gatewayId]: record },
        });
        return record;
      }),

    listMeshPeers: (orgId) =>
      Effect.gen(function* () {
        const path = gatewayRegistryPath(orgId.trim(), home);
        const file = yield* loadFile(path);
        const refreshed = refreshStatuses(file, Date.now());
        if (JSON.stringify(refreshed) !== JSON.stringify(file)) {
          yield* saveFile(path, refreshed);
        }
        return Object.values(refreshed.gateways).sort((a, b) =>
          a.gatewayId.localeCompare(b.gatewayId)
        );
      }),
  });

/** In-memory registry for unit tests. */
export const gatewayRegistryMemoryLayer = (
  seed: readonly GatewayRecord[] = []
): Layer.Layer<GatewayRegistryService> => {
  const store = new Map<string, Map<string, GatewayRecord>>();
  for (const g of seed) {
    const byOrg = store.get(g.orgId) ?? new Map();
    byOrg.set(g.gatewayId, g);
    store.set(g.orgId, byOrg);
  }

  return Layer.succeed(GatewayRegistryService, {
    registerGateway: (input) =>
      Effect.sync(() => {
        const now = new Date().toISOString();
        const record: GatewayRecord = {
          ...input,
          ownerDeveloper: input.kind === "edge" ? input.ownerDeveloper : undefined,
          lastSeen: now,
          status: "healthy",
        };
        const byOrg = store.get(record.orgId) ?? new Map();
        byOrg.set(record.gatewayId, record);
        store.set(record.orgId, byOrg);
        return record;
      }),
    heartbeat: (gatewayId, orgId) =>
      Effect.sync(() => {
        const byOrg = store.get(orgId);
        const existing = byOrg?.get(gatewayId);
        if (!existing || !byOrg) return null;
        const record: GatewayRecord = {
          ...existing,
          lastSeen: new Date().toISOString(),
          status: "healthy",
        };
        byOrg.set(gatewayId, record);
        return record;
      }),
    listMeshPeers: (orgId) =>
      Effect.sync(() => {
        const byOrg = store.get(orgId);
        if (!byOrg) return [];
        const now = Date.now();
        return [...byOrg.values()]
          .map((g) => ({ ...g, status: statusFromLastSeen(g.lastSeen, now) }))
          .sort((a, b) => a.gatewayId.localeCompare(b.gatewayId));
      }),
  });
};
