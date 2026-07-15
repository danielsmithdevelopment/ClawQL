import { logMcpToolShape } from "clawql-api/mcp/tool-shape-log";
import { Effect } from "effect";
import { idpPipelineRunnerEnabled } from "./env.js";
import { decodeRunIdpPipelineInput, runIdpPipelineToolZodShape } from "../schema/index.js";

/** @deprecated Prefer {@link runIdpPipelineToolZodShape}. */
export const runIdpPipelineToolSchema = runIdpPipelineToolZodShape;

export async function handleRunIdpPipelineToolInput(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const parsed = await Effect.runPromise(decodeRunIdpPipelineInput(params));
  logMcpToolShape("run_idp_pipeline", {
    dryRun: parsed.dry_run !== false,
    correlationIdLen: parsed.correlation_id?.length,
    documentPathLen: parsed.document_path?.length,
    skipStages: parsed.skip_stages?.length,
  });

  if (!idpPipelineRunnerEnabled()) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            ok: false,
            error:
              "IDP pipeline runner is disabled. Set CLAWQL_ENABLE_IDP_PIPELINE=1 (requires CLAWQL_ENABLE_DOCUMENTS=1).",
          }),
        },
      ],
    };
  }

  const { runDocumentsEffect, documentsIdpPipelineProgram } =
    await import("../effect/documents-effect-runtime.js");
  const result = await runDocumentsEffect(documentsIdpPipelineProgram(parsed));

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
