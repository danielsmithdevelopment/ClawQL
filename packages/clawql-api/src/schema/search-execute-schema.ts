/**
 * Authoritative Effect Schema for MCP `search` / `execute` inputs.
 *
 * MCP SDK (@modelcontextprotocol/sdk@1.29) still requires Zod at registration —
 * see {@link ./search-execute-zod-edge.js} for the thin transport-compatible shapes.
 * Decode unknown payloads with these schemas inside Effect pipelines; do not treat
 * Zod as the domain validator.
 */

import { Effect, ParseResult, Schema } from "effect";

// --- Shared descriptions (single source for Schema annotations + Zod edge) ---

export const SEARCH_QUERY_DESCRIPTION =
  "Natural language description of what you want to do. " +
  "E.g. 'list services in a region', 'delete a revision', " +
  "'get IAM policy for a job', 'cancel a running execution'.";

export const SEARCH_LIMIT_DESCRIPTION = "Max number of matching operations to return.";

export const EXECUTE_OPERATION_ID_DESCRIPTION =
  "The operation ID from search() results. " +
  "E.g. 'run.projects.locations.services.list'. " +
  "For large binary bodies (e.g. PDF → Tika `application/octet-stream`), prefer the MCP gRPC surface " +
  "(`model_context_protocol.Mcp/CallTool` on the chart gRPC port, default 50051) instead of Streamable HTTP JSON.";

export const EXECUTE_ARGS_DESCRIPTION =
  "Key/value map of parameters for the operation (path + query + body). " +
  'For `application/octet-stream`, pass `body` (+ optional `bodyEncoding: "base64"`, `bodyContentType`). ' +
  "Very large `body` strings should use gRPC CallTool (see operationId note), not HTTP MCP.";

export const EXECUTE_FIELDS_DESCRIPTION =
  "Optional response fields to return. Fewer fields = smaller context window usage. " +
  "Omit to get a sensible default. E.g. ['name', 'uri', 'latestReadyRevision']";

/** MCP `search` tool arguments — Effect Schema (source of truth). */
export const SearchInputSchema = Schema.Struct({
  query: Schema.String.annotations({ description: SEARCH_QUERY_DESCRIPTION }),
  limit: Schema.optionalWith(Schema.Number.pipe(Schema.int(), Schema.between(1, 50)), {
    default: () => 5,
  }).annotations({ description: SEARCH_LIMIT_DESCRIPTION }),
});

export type SearchInputDecoded = Schema.Schema.Type<typeof SearchInputSchema>;

/** MCP `execute` tool arguments — Effect Schema (source of truth). */
export const ExecuteInputSchema = Schema.Struct({
  operationId: Schema.String.annotations({ description: EXECUTE_OPERATION_ID_DESCRIPTION }),
  args: Schema.Record({ key: Schema.String, value: Schema.Unknown }).annotations({
    description: EXECUTE_ARGS_DESCRIPTION,
  }),
  fields: Schema.optional(
    Schema.Array(Schema.String).annotations({ description: EXECUTE_FIELDS_DESCRIPTION })
  ),
});

export type ExecuteInputDecoded = Schema.Schema.Type<typeof ExecuteInputSchema>;

export const RESUME_EXECUTION_ID_DESCRIPTION =
  "Pending execution id from a mandate_required execute response (pex_…). " +
  "Resumes the exact parked operationId + args — no alternate arguments.";

export const RESUME_DECISION_DESCRIPTION =
  "approve (default) runs the parked call; decline records HUMAN_REJECTION and does not execute.";

/** MCP `resume` tool arguments — Effect Schema (source of truth). */
export const ResumeInputSchema = Schema.Struct({
  executionId: Schema.String.annotations({ description: RESUME_EXECUTION_ID_DESCRIPTION }),
  decision: Schema.optional(
    Schema.Literal("approve", "decline").annotations({ description: RESUME_DECISION_DESCRIPTION })
  ),
});

export type ResumeInputDecoded = Schema.Schema.Type<typeof ResumeInputSchema>;

function formatParseError(err: ParseResult.ParseError): Error {
  return new Error(ParseResult.TreeFormatter.formatErrorSync(err));
}

/** Decode unknown MCP search args into {@link SearchInputDecoded}. */
export function decodeSearchInput(raw: unknown): Effect.Effect<SearchInputDecoded, Error> {
  return Schema.decodeUnknown(SearchInputSchema)(raw).pipe(Effect.mapError(formatParseError));
}

/** Decode unknown MCP execute args into {@link ExecuteInputDecoded}. */
export function decodeExecuteInput(raw: unknown): Effect.Effect<ExecuteInputDecoded, Error> {
  return Schema.decodeUnknown(ExecuteInputSchema)(raw).pipe(Effect.mapError(formatParseError));
}

/** Decode unknown MCP resume args into {@link ResumeInputDecoded}. */
export function decodeResumeInput(raw: unknown): Effect.Effect<ResumeInputDecoded, Error> {
  return Schema.decodeUnknown(ResumeInputSchema)(raw).pipe(Effect.mapError(formatParseError));
}
