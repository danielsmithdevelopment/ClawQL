/**
 * MCP execute entry — delegates to clawql-api execute core with injected environment.
 */

import {
  defaultFields,
  executeClawqlOperationWithEnv,
  executeOutputFields,
  projectRestByFields,
  type ExecuteClawqlOperationParams,
  type McpTextContent,
} from "clawql-api";
import { mcpExecuteEnvironment } from "./mcp-execute-environment.js";

export type { ExecuteClawqlOperationParams, McpTextContent };

export { defaultFields, executeOutputFields, projectRestByFields };

/** Shared execute body — returns MCP text content blocks. */
export async function executeClawqlOperationCore(
  params: ExecuteClawqlOperationParams
): Promise<McpTextContent[]> {
  return executeClawqlOperationWithEnv(mcpExecuteEnvironment, params);
}
