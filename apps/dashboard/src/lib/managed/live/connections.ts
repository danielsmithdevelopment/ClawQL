import {
  getPendingSourcesDir,
  readCustomSourcesFileEffect,
  readPendingSourceEffect,
  type CustomSourceEntry,
} from "clawql-api";
import { Effect } from "effect";
import { readdir } from "node:fs/promises";

import { CONNECTIONS, type ConnectionItem } from "@/lib/managed/fixtures";
import { readManagedDataSource, resolveWithFallbackEffect } from "@/lib/managed/data-source";

function relativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return iso;
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr} hr ago`;
  return `${Math.round(hr / 24)} days ago`;
}

function kindOps(kind: CustomSourceEntry["kind"]): ConnectionItem["ops"] {
  // Spec-derived counts land when we load ops per source; kind defaults keep the UI useful.
  if (kind === "openapi" || kind === "discovery") {
    return { readsAllowed: 100, writesMandate: 40, deletesBlocked: 8 };
  }
  if (kind === "mcp" || kind === "webmcp") {
    return { readsAllowed: 40, writesMandate: 20, deletesBlocked: 2 };
  }
  if (kind === "graphql" || kind === "grpc") {
    return { readsAllowed: 60, writesMandate: 25, deletesBlocked: 4 };
  }
  return { readsAllowed: 10, writesMandate: 5, deletesBlocked: 0 };
}

export function mapCustomSourceToConnection(entry: CustomSourceEntry): ConnectionItem {
  const endpoint =
    entry.url ||
    entry.mcpUrl ||
    entry.graphqlEndpoint ||
    entry.grpcEndpoint ||
    entry.webmcpPageUrl ||
    entry.cliCommand ||
    entry.kind;
  return {
    id: entry.id,
    name: entry.name || entry.id,
    summary: `${entry.kind}${entry.trusted ? ", trusted" : ""}`,
    lastUsed: relativeTime(entry.addedAt),
    status: "connected",
    statusLabel: "Connected",
    detailTitle: entry.name || entry.id,
    detailSubtitle: `${entry.kind}${endpoint ? ` · ${endpoint}` : ""}`,
    accounts: [],
    ops: kindOps(entry.kind),
    usedBy: [],
  };
}

const listPendingSourceIdsEffect = (home?: string): Effect.Effect<readonly string[], Error> =>
  Effect.tryPromise({
    try: async () => {
      try {
        const names = await readdir(getPendingSourcesDir(home));
        return names
          .filter((n) => n.startsWith("psp_") && n.endsWith(".json"))
          .map((n) => n.slice(0, -".json".length));
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return [];
        throw e;
      }
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

export const listManagedConnectionsEffect = (
  env: NodeJS.ProcessEnv = process.env,
): Effect.Effect<{
  readonly connections: ConnectionItem[];
  readonly source: "live" | "fixture";
}> =>
  resolveWithFallbackEffect({
    source: readManagedDataSource(env),
    fixture: [...CONNECTIONS],
    isLiveUseful: (rows) => rows.length > 0,
    live: Effect.gen(function* () {
      const home = env.CLAWQL_HOME?.trim() || undefined;
      const file = yield* readCustomSourcesFileEffect(home);
      const items: ConnectionItem[] = file.sources.map(mapCustomSourceToConnection);

      const pendingIds = yield* listPendingSourceIdsEffect(home);
      for (const id of pendingIds) {
        const record = yield* readPendingSourceEffect(id, home);
        if (!record || record.status !== "pending") continue;
        if (items.some((c) => c.id === record.entry.id)) continue;
        items.push({
          id: record.entry.id,
          name: record.entry.name || record.entry.id,
          summary: `Proposed by ${record.proposedBy ?? "an agent"}`,
          lastUsed: "Not connected yet",
          status: "waiting-review",
          statusLabel: "Waiting in Review",
          detailTitle: record.entry.name || record.entry.id,
          detailSubtitle: `${record.entry.kind} — waiting in Review`,
          accounts: [],
          ops: { readsAllowed: 0, writesMandate: 0, deletesBlocked: 0 },
          usedBy: [],
        });
      }

      return items;
    }),
  }).pipe(Effect.map(({ data, source }) => ({ connections: data, source })));
