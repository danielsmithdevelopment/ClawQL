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

export { handleIngestExternalKnowledgeToolInput } from "clawql-documents/plugin";
