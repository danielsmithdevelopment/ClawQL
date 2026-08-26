import { logMcpToolShape } from "clawql-api/mcp/tool-shape-log";
import type { McpToolDefinition } from "clawql-core";
import { z } from "zod";
import {
  CreateSeedFromDocumentSchema,
  GetLineageStatusSchema,
  MeasureDriftSchema,
  ProposeSeedRevisionFromEvalSchema,
  RunOuroborosSchema,
  ouroborosMcpTools,
} from "../mcp-hooks.js";

export type OuroborosToolDefOptions = {
  /** ([#250](https://github.com/danielsmithdevelopment/ClawQL/issues/250)): include `ouroboros_propose_seed_revision_from_eval`. */
  enableLangfuseEval?: boolean;
};

function textResult(obj: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(obj) }] };
}

/**
 * Shared MCP tool definitions for Ouroboros — consumed by the clawql-core Plugin
 * shim and by `clawql-harness` `OuroborosPlugin` (single implementation surface).
 */
export function buildOuroborosMcpToolDefinitions(
  options: OuroborosToolDefOptions = {}
): readonly McpToolDefinition[] {
  const t = ouroborosMcpTools;
  const enableLangfuseEval = options.enableLangfuseEval === true;
  const tools: McpToolDefinition[] = [
    {
      name: t.createSeedFromDocument.name,
      description: t.createSeedFromDocument.description,
      schema: CreateSeedFromDocumentSchema.shape,
      handler: async (args) => {
        logMcpToolShape(t.createSeedFromDocument.name, {
          documentIdLen: (args as { documentId?: string }).documentId?.length,
          taskType: (args as { taskType?: string }).taskType,
        });
        const { runOuroborosEffect, ouroborosCreateSeedProgram } =
          await import("../effect/ouroboros-effect-runtime.js");
        const r = await runOuroborosEffect(
          ouroborosCreateSeedProgram(args as z.infer<typeof CreateSeedFromDocumentSchema>)
        );
        return textResult(r);
      },
    },
    {
      name: t.runEvolutionaryLoop.name,
      description: t.runEvolutionaryLoop.description,
      schema: RunOuroborosSchema.shape,
      handler: async (args) => {
        logMcpToolShape(t.runEvolutionaryLoop.name, {
          maxGenerations: (args as { maxGenerations?: number }).maxGenerations,
        });
        const { runOuroborosEffect, ouroborosRunLoopProgram } =
          await import("../effect/ouroboros-effect-runtime.js");
        const r = await runOuroborosEffect(
          ouroborosRunLoopProgram(args as z.infer<typeof RunOuroborosSchema>)
        );
        return textResult(r);
      },
    },
    {
      name: t.getLineageStatus.name,
      description: t.getLineageStatus.description,
      schema: GetLineageStatusSchema.shape,
      handler: async (args) => {
        logMcpToolShape(t.getLineageStatus.name, {
          seedIdLen: (args as { seedId?: string }).seedId?.length,
        });
        const { runOuroborosEffect, ouroborosLineageProgram } =
          await import("../effect/ouroboros-effect-runtime.js");
        const r = await runOuroborosEffect(
          ouroborosLineageProgram(args as z.infer<typeof GetLineageStatusSchema>)
        );
        return textResult(r);
      },
    },
    {
      name: t.measureDrift.name,
      description: t.measureDrift.description,
      schema: MeasureDriftSchema.shape,
      handler: async (args) => {
        logMcpToolShape(t.measureDrift.name, {
          seedIdLen: (args as { seedId?: string }).seedId?.length,
          outputLen: (args as { currentOutput?: string }).currentOutput?.length,
        });
        const { runOuroborosEffect, ouroborosMeasureDriftProgram } =
          await import("../effect/ouroboros-effect-runtime.js");
        const r = await runOuroborosEffect(
          ouroborosMeasureDriftProgram(args as z.infer<typeof MeasureDriftSchema>)
        );
        return textResult(r);
      },
    },
  ];

  if (enableLangfuseEval) {
    tools.push({
      name: t.proposeSeedRevisionFromEval.name,
      description: t.proposeSeedRevisionFromEval.description,
      schema: ProposeSeedRevisionFromEvalSchema.shape,
      handler: async (args) => {
        logMcpToolShape(t.proposeSeedRevisionFromEval.name, {
          hasPayload: (args as { payload?: unknown }).payload !== undefined,
          scoreValue: (args as { scoreValue?: number }).scoreValue,
        });
        const { runOuroborosEffect, ouroborosProposeRevisionProgram } =
          await import("../effect/ouroboros-effect-runtime.js");
        const r = await runOuroborosEffect(
          ouroborosProposeRevisionProgram(
            args as z.infer<typeof ProposeSeedRevisionFromEvalSchema>
          )
        );
        return textResult(r);
      },
    });
  }

  return tools;
}
