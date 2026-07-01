import { logMcpToolShape } from "clawql-api/mcp/tool-shape-log";
import type { Plugin } from "clawql-core";
import { Effect } from "effect";
import { z } from "zod";
import {
  CreateSeedFromDocumentSchema,
  GetLineageStatusSchema,
  RunOuroborosSchema,
  ouroborosMcpTools,
} from "../mcp-hooks.js";
import { ensureOuroborosPoolShutdownHooks, getOuroborosContext, resetOuroborosContextForTests } from "./context.js";

export const OUROBOROS_PLUGIN_ID = "clawql-ouroboros";

function textResult(obj: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(obj) }] };
}

export function createOuroborosPlugin(): Plugin {
  const t = ouroborosMcpTools;
  return {
    id: OUROBOROS_PLUGIN_ID,
    version: "0.1.1",
    kind: "default",
    onRegister: (api) =>
      Effect.gen(function* () {
        ensureOuroborosPoolShutdownHooks();
        yield* api.registerMcpTool({
          name: t.createSeedFromDocument.name,
          schema: CreateSeedFromDocumentSchema.shape,
          handler: async (args) => {
            logMcpToolShape(t.createSeedFromDocument.name, {
              documentIdLen: (args as { documentId?: string }).documentId?.length,
              taskType: (args as { taskType?: string }).taskType,
            });
            const r = await t.createSeedFromDocument.handler(
              args as z.infer<typeof CreateSeedFromDocumentSchema>,
              getOuroborosContext()
            );
            return textResult(r);
          },
        });
        yield* api.registerMcpTool({
          name: t.runEvolutionaryLoop.name,
          schema: RunOuroborosSchema.shape,
          handler: async (args) => {
            logMcpToolShape(t.runEvolutionaryLoop.name, {
              maxGenerations: (args as { maxGenerations?: number }).maxGenerations,
            });
            const r = await t.runEvolutionaryLoop.handler(
              args as z.infer<typeof RunOuroborosSchema>,
              getOuroborosContext()
            );
            return textResult(r);
          },
        });
        yield* api.registerMcpTool({
          name: t.getLineageStatus.name,
          schema: GetLineageStatusSchema.shape,
          handler: async (args) => {
            logMcpToolShape(t.getLineageStatus.name, {
              seedIdLen: (args as { seedId?: string }).seedId?.length,
            });
            const r = await t.getLineageStatus.handler(
              args as z.infer<typeof GetLineageStatusSchema>,
              getOuroborosContext()
            );
            return textResult(r);
          },
        });
      }),
    onTeardown: () => Effect.sync(() => resetOuroborosContextForTests()),
  };
}
