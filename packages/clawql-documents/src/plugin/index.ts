export {
  configureDocumentsPluginDeps,
  getDocumentsPluginDeps,
  resetDocumentsPluginDepsForTests,
  type DocumentsPluginDeps,
  type DocumentsPluginExecuteParams,
} from "./deps.js";
export { makeDocumentsLayer, type DocumentsLayerError } from "./documents-layer.js";
export {
  handleRunIdpPipelineToolInput,
  runIdpPipelineToolSchema,
} from "../pipeline/run-idp-pipeline.js";
export {
  createDocumentsPlugin,
  DOCUMENTS_PLUGIN_ID,
  handleIngestExternalKnowledgeToolInput,
  ingestExternalKnowledgeToolSchema,
  knowledgeSearchOnyxToolSchema,
} from "./documents-plugin.js";
export {
  handleKnowledgeSearchOnyxToolInput,
  ONYX_SEND_SEARCH_OPERATION_ID,
  resolveOnyxSendSearchOperationId,
  type KnowledgeSearchOnyxInput,
} from "./knowledge-search-onyx.js";
