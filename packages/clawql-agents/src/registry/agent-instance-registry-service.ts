/**
 * Org-scoped persistent agent instance registry — Effect Tag + Layer.
 * Persistence: $CLAWQL_HOME/agents/registry/orgs/<orgId>/instances.json
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Context, Effect, Layer } from "effect";
import {
  AGENT_HEARTBEAT_INTERVAL_MS,
  AGENT_IDLE_AFTER_MISSED,
  AGENT_OFFLINE_AFTER_MISSED,
  type AgentInstanceRecord,
  type AgentInstanceStatus,
  type RegisterAgentInstanceInput,
} from "./types.js";

export type AgentInstanceRegistryFile = {
  readonly version: 1;
  readonly instances: Record<string, AgentInstanceRecord>;
};

export class AgentInstanceRegistryService extends Context.Tag(
  "clawql-agents/AgentInstanceRegistryService"
)<
  AgentInstanceRegistryService,
  {
    readonly registerAgentInstance: (
      input: RegisterAgentInstanceInput
    ) => Effect.Effect<AgentInstanceRecord>;
    readonly heartbeat: (
      agentId: string,
      orgId: string
    ) => Effect.Effect<AgentInstanceRecord | null>;
    readonly listAgentInstances: (orgId: string) => Effect.Effect<readonly AgentInstanceRecord[]>;
  }
>() {}

function defaultHome(): string {
  const raw = process.env.CLAWQL_HOME?.trim();
  if (raw) return resolve(raw);
  return resolve(homedir(), ".ClawQL");
}

export const agentInstanceRegistryPath = (orgId: string, home?: string): string =>
  join(home ?? defaultHome(), "agents", "registry", "orgs", orgId, "instances.json");

export const statusFromLastActive = (
  lastActiveIso: string,
  nowMs: number = Date.now(),
  intervalMs: number = AGENT_HEARTBEAT_INTERVAL_MS
): AgentInstanceStatus => {
  const last = Date.parse(lastActiveIso);
  if (!Number.isFinite(last)) return "offline";
  const missed = (nowMs - last) / intervalMs;
  if (missed <= AGENT_IDLE_AFTER_MISSED) return "active";
  if (missed <= AGENT_OFFLINE_AFTER_MISSED) return "idle";
  return "offline";
};

const emptyFile = (): AgentInstanceRegistryFile => ({ version: 1, instances: {} });

const loadFile = (path: string): Effect.Effect<AgentInstanceRegistryFile> =>
  Effect.tryPromise({
    try: async () => {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as AgentInstanceRegistryFile;
      if (!parsed || typeof parsed !== "object" || !parsed.instances) return emptyFile();
      return { version: 1 as const, instances: parsed.instances };
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  }).pipe(Effect.catchAll(() => Effect.succeed(emptyFile())));

const saveFile = (path: string, file: AgentInstanceRegistryFile): Effect.Effect<void> =>
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

const refreshStatuses = (
  file: AgentInstanceRegistryFile,
  nowMs: number
): AgentInstanceRegistryFile => {
  const instances: Record<string, AgentInstanceRecord> = {};
  for (const [id, a] of Object.entries(file.instances)) {
    instances[id] = { ...a, status: statusFromLastActive(a.lastActive, nowMs) };
  }
  return { version: 1, instances };
};

export const agentInstanceRegistryLiveLayer = (
  home?: string
): Layer.Layer<AgentInstanceRegistryService> =>
  Layer.succeed(AgentInstanceRegistryService, {
    registerAgentInstance: (input) =>
      Effect.gen(function* () {
        const orgId = input.orgId.trim();
        const agentId = input.agentId.trim();
        if (!orgId || !agentId || !input.parentGatewayId.trim()) {
          return yield* Effect.die(
            new Error("registerAgentInstance requires agentId, orgId, parentGatewayId")
          );
        }
        const path = agentInstanceRegistryPath(orgId, home);
        const now = new Date().toISOString();
        const record: AgentInstanceRecord = {
          agentId,
          agentType: input.agentType,
          parentGatewayId: input.parentGatewayId.trim(),
          orgId,
          lastActive: now,
          status: "active",
        };
        const file = yield* loadFile(path);
        yield* saveFile(path, {
          version: 1,
          instances: { ...file.instances, [agentId]: record },
        });
        return record;
      }),

    heartbeat: (agentId, orgId) =>
      Effect.gen(function* () {
        const path = agentInstanceRegistryPath(orgId.trim(), home);
        const file = yield* loadFile(path);
        const existing = file.instances[agentId.trim()];
        if (!existing) return null;
        const record: AgentInstanceRecord = {
          ...existing,
          lastActive: new Date().toISOString(),
          status: "active",
        };
        yield* saveFile(path, {
          version: 1,
          instances: { ...file.instances, [record.agentId]: record },
        });
        return record;
      }),

    listAgentInstances: (orgId) =>
      Effect.gen(function* () {
        const path = agentInstanceRegistryPath(orgId.trim(), home);
        const file = yield* loadFile(path);
        const refreshed = refreshStatuses(file, Date.now());
        if (JSON.stringify(refreshed) !== JSON.stringify(file)) {
          yield* saveFile(path, refreshed);
        }
        return Object.values(refreshed.instances).sort((a, b) =>
          a.agentId.localeCompare(b.agentId)
        );
      }),
  });

export const agentInstanceRegistryMemoryLayer = (
  seed: readonly AgentInstanceRecord[] = []
): Layer.Layer<AgentInstanceRegistryService> => {
  const store = new Map<string, Map<string, AgentInstanceRecord>>();
  for (const a of seed) {
    const byOrg = store.get(a.orgId) ?? new Map();
    byOrg.set(a.agentId, a);
    store.set(a.orgId, byOrg);
  }
  return Layer.succeed(AgentInstanceRegistryService, {
    registerAgentInstance: (input) =>
      Effect.sync(() => {
        const record: AgentInstanceRecord = {
          ...input,
          lastActive: new Date().toISOString(),
          status: "active",
        };
        const byOrg = store.get(record.orgId) ?? new Map();
        byOrg.set(record.agentId, record);
        store.set(record.orgId, byOrg);
        return record;
      }),
    heartbeat: (agentId, orgId) =>
      Effect.sync(() => {
        const byOrg = store.get(orgId);
        const existing = byOrg?.get(agentId);
        if (!existing || !byOrg) return null;
        const record: AgentInstanceRecord = {
          ...existing,
          lastActive: new Date().toISOString(),
          status: "active",
        };
        byOrg.set(agentId, record);
        return record;
      }),
    listAgentInstances: (orgId) =>
      Effect.sync(() => {
        const byOrg = store.get(orgId);
        if (!byOrg) return [];
        const now = Date.now();
        return [...byOrg.values()]
          .map((a) => ({ ...a, status: statusFromLastActive(a.lastActive, now) }))
          .sort((a, b) => a.agentId.localeCompare(b.agentId));
      }),
  });
};
