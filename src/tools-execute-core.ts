/**
 * MCP execute entry — delegates to clawql-api execute core.
 */

import {
  defaultFields,
  executeClawqlOperation,
  executeOutputFields,
  projectRestByFields,
  type ExecuteClawqlOperationParams,
  type McpTextContent,
} from "clawql-api";

export type { ExecuteClawqlOperationParams, McpTextContent };

export { defaultFields, executeOutputFields, projectRestByFields };

/** Shared execute body — returns MCP text content blocks. */
export async function executeClawqlOperationCore(
  params: ExecuteClawqlOperationParams
): Promise<McpTextContent[]> {
  return executeClawqlOperation(params);
}
