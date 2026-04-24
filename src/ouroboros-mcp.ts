/**
 * Optional MCP tools for clawql-ouroboros (GitHub #141). Registered when CLAWQL_ENABLE_OUROBOROS=1.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EvolutionaryLoop, InMemoryEventStore } from "clawql-ouroboros";
import type { EventStore } from "clawql-ouroboros";
import {
  CreateSeedFromDocumentSchema,
  GetLineageStatusSchema,
  RunOuroborosSchema,
  ouroborosMcpTools,
  type OuroborosContext,
} from "clawql-ouroboros/mcp-hooks";
import { createDefaultOuroborosEngines } from "./ouroboros/default-engines.js";
import { PostgresOuroborosEventStore } from "./ouroboros/postgres-event-store.js";
import { getOuroborosPgPool } from "./ouroboros/postgres-pool.js";

let ctxCache: OuroborosContext | null = null;

function createEventStore(): EventStore {
  const pgPool = getOuroborosPgPool();
  if (pgPool) {
    return new PostgresOuroborosEventStore(pgPool);
  }
  return new InMemoryEventStore();
}

function getOuroborosContext(): OuroborosContext {
  if (!ctxCache) {
    const eventStore = createEventStore();
    const engines = createDefaultOuroborosEngines();
    const ouroborosLoop = new EvolutionaryLoop(
      eventStore,
      engines.wonder,
      engines.reflect,
      engines.execute,
      engines.evaluate,
      {}
    );
    ctxCache = { ouroborosLoop, eventStore };
  }
  return ctxCache;
}

/** Vitest: clear singleton so env / pool changes apply. */
export function resetOuroborosContextForTests(): void {
  ctxCache = null;
}

function textResult(obj: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(obj) }] };
}

/**
 * Registers `ouroboros_create_seed_from_document`, `ouroboros_run_evolutionary_loop`,
 * `ouroboros_get_lineage_status` (names from clawql-ouroboros/mcp-hooks).
 */
export function registerOuroborosTools(server: McpServer): void {
  const t = ouroborosMcpTools;

  server.tool(t.createSeedFromDocument.name, CreateSeedFromDocumentSchema.shape, async (args) => {
    const r = await t.createSeedFromDocument.handler(args, getOuroborosContext());
    return textResult(r);
  });

  server.tool(t.runEvolutionaryLoop.name, RunOuroborosSchema.shape, async (args) => {
    const r = await t.runEvolutionaryLoop.handler(args, getOuroborosContext());
    return textResult(r);
  });

  server.tool(t.getLineageStatus.name, GetLineageStatusSchema.shape, async (args) => {
    const r = await t.getLineageStatus.handler(args, getOuroborosContext());
    return textResult(r);
  });
}
