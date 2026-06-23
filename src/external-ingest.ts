/**
 * MCP tool `ingest_external_knowledge` — transport handler; core logic in `clawql-documents/ingest/external-ingest`.
 */

export {
  externalIngestFeatureEnabled,
  runIngestExternalKnowledge,
  type ExternalIngestDocumentInput,
  type ExternalIngestInput,
  type ExternalIngestResult,
} from "clawql-documents/ingest/external-ingest";

import {
  runIngestExternalKnowledge,
  type ExternalIngestInput,
} from "clawql-documents/ingest/external-ingest";
import { logMcpToolShape } from "./mcp-tool-log.js";

export async function handleIngestExternalKnowledgeToolInput(
  params: ExternalIngestInput
): Promise<{ content: { type: "text"; text: string }[] }> {
  logMcpToolShape("ingest_external_knowledge", {
    sourceChars: params.source?.length ?? 0,
    dryRun: params.dryRun !== false,
    hasScope: Boolean(params.scope?.trim()),
    documentCount: params.documents?.length ?? 0,
    urlChars: params.url?.length ?? 0,
  });
  const result = await runIngestExternalKnowledge(params);
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
