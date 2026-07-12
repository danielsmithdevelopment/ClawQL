import { logMcpToolShape } from "clawql-api/mcp/tool-shape-log";
import type { Plugin } from "clawql-core";
import { Effect } from "effect";
import { z } from "zod";
import {
  CreateSeedFromDocumentSchema,
  GetLineageStatusSchema,
  MeasureDriftSchema,
  ProposeSeedRevisionFromEvalSchema,
  RunOuroborosSchema,
  ouroborosMcpTools,
} from "../mcp-hooks.js";
import {
  ensureOuroborosPoolShutdownHooks,
  getOuroborosContext,
  resetOuroborosContextForTests,
} from "./context.js";

export type OuroborosPluginOptions = {
  /** ([#250](https://github.com/danielsmithdevelopment/ClawQL/issues/250)): register `ouroboros_propose_seed_revision_from_eval`. */
  enableLangfuseEval?: boolean;
};

export const OUROBOROS_PLUGIN_ID = "clawql-ouroboros";

function textResult(obj: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(obj) }] };
}

export function createOuroborosPlugin(options: OuroborosPluginOptions = {}): Plugin {
  const t = ouroborosMcpTools;
  const enableLangfuseEval = options.enableLangfuseEval === true;
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
        yield* api.registerMcpTool({
          name: t.measureDrift.name,
          schema: MeasureDriftSchema.shape,
          handler: async (args) => {
            logMcpToolShape(t.measureDrift.name, {
              seedIdLen: (args as { seedId?: string }).seedId?.length,
              outputLen: (args as { currentOutput?: string }).currentOutput?.length,
            });
            const r = await t.measureDrift.handler(
              args as z.infer<typeof MeasureDriftSchema>,
              getOuroborosContext()
            );
            return textResult(r);
          },
        });
        if (enableLangfuseEval) {
          yield* api.registerMcpTool({
            name: t.proposeSeedRevisionFromEval.name,
            schema: ProposeSeedRevisionFromEvalSchema.shape,
            handler: async (args) => {
              logMcpToolShape(t.proposeSeedRevisionFromEval.name, {
                hasPayload: (args as { payload?: unknown }).payload !== undefined,
                scoreValue: (args as { scoreValue?: number }).scoreValue,
              });
              const r = await t.proposeSeedRevisionFromEval.handler(
                args as z.infer<typeof ProposeSeedRevisionFromEvalSchema>,
                getOuroborosContext()
              );
              return textResult(r);
            },
          });
        }
      }),
    onTeardown: () => Effect.sync(() => resetOuroborosContextForTests()),
  };
}
