import { logMcpToolShape } from "clawql-api/mcp/tool-shape-log";
import { defineRegisteringProviderPlugin, type ProviderPlugin } from "clawql-core";
import { Effect } from "effect";
import { z } from "zod";
import {
  dataIngestProgram,
  dataQueryProgram,
  dataStatusProgram,
  runDataEffect,
} from "../effect/index.js";

export const DATA_PLUGIN_ID = "clawql-data";

const jsonRecord = z.record(z.string(), z.unknown());

export const dataQuerySchema = {
  sql: z
    .string()
    .describe(
      "Single read-only SQL statement (SELECT / WITH / DESCRIBE / SHOW / SUMMARIZE). " +
        "Engine is selected via CLAWQL_DATA_ENGINE (registered plugins in clawql-data)."
    ),
};

export const dataIngestSchema = {
  matters: z
    .array(jsonRecord)
    .optional()
    .describe("Matter rows (typed columns + optional _open_facts / _matter_documents)"),
  documents: z.array(jsonRecord).optional().describe("matter_documents rows"),
  openFacts: z.array(jsonRecord).optional(),
  mattersRoot: z
    .string()
    .optional()
    .describe("Absolute DMS matters directory — inventory classification runs in clawql-data."),
  replace: z.boolean().optional().describe("Replace existing tables (default true)"),
};

function textResult(payload: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

export async function handleDataQueryToolInput(params: { sql: string }) {
  logMcpToolShape("data_query", { sqlLen: params.sql.length });
  const result = await runDataEffect(dataQueryProgram(params.sql));
  return textResult(result);
}

export async function handleDataIngestToolInput(params: {
  matters?: Record<string, unknown>[];
  documents?: Record<string, unknown>[];
  openFacts?: Record<string, unknown>[];
  mattersRoot?: string;
  replace?: boolean;
}) {
  logMcpToolShape("data_ingest", {
    matterCount: params.matters?.length ?? 0,
    documentCount: params.documents?.length ?? 0,
    hasRoot: Boolean(params.mattersRoot),
  });
  try {
    const result = await runDataEffect(
      dataIngestProgram({
        matters: params.matters,
        documents: params.documents,
        openFacts: params.openFacts as never,
        mattersRoot: params.mattersRoot,
        replace: params.replace,
      })
    );
    return textResult(result);
  } catch (err) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            null,
            2
          ),
        },
      ],
      isError: true as const,
    };
  }
}

export async function handleDataStatusToolInput() {
  const status = await runDataEffect(dataStatusProgram());
  return textResult(status);
}

export function createDataPlugin(): ProviderPlugin {
  return defineRegisteringProviderPlugin({
    id: DATA_PLUGIN_ID,
    version: "0.1.0",
    description: "ClawQL data query, ingest, and status MCP tools",
    register: (api) =>
      Effect.gen(function* () {
        yield* api.registerMcpTool({
          name: "data_query",
          schema: dataQuerySchema,
          handler: (args) => handleDataQueryToolInput(args as { sql: string }),
        });
        yield* api.registerMcpTool({
          name: "clawql_sql",
          schema: dataQuerySchema,
          handler: (args) => handleDataQueryToolInput(args as { sql: string }),
        });
        yield* api.registerMcpTool({
          name: "data_ingest",
          schema: dataIngestSchema,
          handler: (args) => handleDataIngestToolInput(args as never),
        });
        yield* api.registerMcpTool({
          name: "data_status",
          schema: {},
          handler: () => handleDataStatusToolInput(),
        });
      }),
  });
}
