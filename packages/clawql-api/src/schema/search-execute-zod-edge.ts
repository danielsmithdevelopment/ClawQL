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
  EXECUTE_WHERE_DESCRIPTION,
  EXECUTE_WHERE_MAX_LENGTH,
  RESUME_DECISION_DESCRIPTION,
  RESUME_EXECUTION_ID_DESCRIPTION,
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
  where: z
    .string()
    .max(EXECUTE_WHERE_MAX_LENGTH)
    .optional()
    .describe(EXECUTE_WHERE_DESCRIPTION),
} as const;

/** Zod raw shape for MCP `resume` — mirrors {@link ResumeInputSchema}. */
export const resumeToolZodShape = {
  executionId: z.string().describe(RESUME_EXECUTION_ID_DESCRIPTION),
  decision: z.enum(["approve", "decline"]).optional().describe(RESUME_DECISION_DESCRIPTION),
} as const;

/** Zod raw shape for MCP `sources_propose` (v0.1). */
export const sourcesProposeToolZodShape = {
  url: z
    .string()
    .describe("HTTPS URL of an OpenAPI, Discovery, GraphQL, gRPC, MCP, or WebMCP source"),
  name: z.string().optional().describe("Optional display name for the source"),
  kind: z
    .enum(["openapi", "discovery", "graphql", "grpc", "mcp", "webmcp"])
    .optional()
    .describe("Optional kind hint when auto-detect is ambiguous"),
  id: z.string().optional().describe("Optional stable source id (slug)"),
  dryRun: z
    .boolean()
    .optional()
    .describe(
      "Default true: preview only. false parks a proposal for operator approve (CLI/console)"
    ),
} as const;

/**
 * Operator HTTP/console shape for source approval — **not** an MCP tool.
 * Agents must never be issued `sources_approve`.
 */
export const sourcesApproveToolZodShape = {
  proposalId: z.string().describe("Proposal id from sources_propose (psp_…)"),
  decision: z
    .enum(["approve", "decline"])
    .describe("Operator decision — approve writes sources.json; decline rejects"),
} as const;
