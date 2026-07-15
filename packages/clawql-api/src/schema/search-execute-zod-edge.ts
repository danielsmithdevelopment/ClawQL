/**
 * Thin Zod shapes for MCP SDK tool registration (`server.tool`).
 *
 * SDK 1.29 requires Zod as a peer; Effect Schema remains the domain validator
 * ({@link ./search-execute-schema.js}). When the SDK accepts Standard Schema /
 * JSON Schema without a Zod peer, delete this file and register
 * `Schema.standardSchemaV1(...)` instead.
 */

import { z } from "zod";
import {
  EXECUTE_ARGS_DESCRIPTION,
  EXECUTE_FIELDS_DESCRIPTION,
  EXECUTE_OPERATION_ID_DESCRIPTION,
  SEARCH_LIMIT_DESCRIPTION,
  SEARCH_QUERY_DESCRIPTION,
} from "./search-execute-schema.js";

/** Zod raw shape for MCP `search` — mirrors {@link SearchInputSchema}. */
export const searchToolZodShape = {
  query: z.string().describe(SEARCH_QUERY_DESCRIPTION),
  limit: z.number().int().min(1).max(50).default(5).describe(SEARCH_LIMIT_DESCRIPTION),
} as const;

/** Zod raw shape for MCP `execute` — mirrors {@link ExecuteInputSchema}. */
export const executeToolZodShape = {
  operationId: z.string().describe(EXECUTE_OPERATION_ID_DESCRIPTION),
  args: z.record(z.string(), z.unknown()).describe(EXECUTE_ARGS_DESCRIPTION),
  fields: z.array(z.string()).optional().describe(EXECUTE_FIELDS_DESCRIPTION),
} as const;
