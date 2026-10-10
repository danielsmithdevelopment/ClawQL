/**
 * Authoritative Effect Schema for MCP `search` / `execute` inputs.
 *
 * MCP SDK (@modelcontextprotocol/sdk@1.29) still requires Zod at registration —
 * see {@link ./search-execute-zod-edge.js} for the thin transport-compatible shapes.
 * Decode unknown payloads with these schemas inside Effect pipelines; do not treat
 * Zod as the domain validator.
 */

import { Effect, Schema, SchemaIssue } from "effect";

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

/** Max length for execute `where` JMESPath (must match where-filter caps). */
export const EXECUTE_WHERE_MAX_LENGTH = 512;

export const EXECUTE_WHERE_DESCRIPTION =
  "Optional JMESPath evaluated server-side on the provider JSON after fetch, " +
  "before fields projection. Filter arrays (e.g. [?state=='open']) or extract " +
  "(e.g. user.login). Max 512 chars; invalid expressions fail closed.";

/** MCP `search` tool arguments — Effect Schema (source of truth). */
export const SearchInputSchema = Schema.Struct({
  query: Schema.String.annotate({ description: SEARCH_QUERY_DESCRIPTION }),
  limit: Schema.Number.pipe(
    Schema.check(Schema.isInt()),
    Schema.check(Schema.isBetween({ minimum: 1, maximum: 50 }))
  )
    .pipe(Schema.withDecodingDefaultType(Effect.succeed(5)))
    .annotate({ description: SEARCH_LIMIT_DESCRIPTION }),
});

export type SearchInputDecoded = Schema.Schema.Type<typeof SearchInputSchema>;

/** MCP `execute` tool arguments — Effect Schema (source of truth). */
export const ExecuteInputSchema = Schema.Struct({
  operationId: Schema.String.annotate({ description: EXECUTE_OPERATION_ID_DESCRIPTION }),
  args: Schema.Record(Schema.String, Schema.Unknown).annotate({
    description: EXECUTE_ARGS_DESCRIPTION,
  }),
  fields: Schema.optional(
    Schema.Array(Schema.String).annotate({ description: EXECUTE_FIELDS_DESCRIPTION })
  ),
  where: Schema.optional(
    Schema.String.pipe(Schema.check(Schema.isMaxLength(EXECUTE_WHERE_MAX_LENGTH))).annotate({
      description: EXECUTE_WHERE_DESCRIPTION,
    })
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
  executionId: Schema.String.annotate({ description: RESUME_EXECUTION_ID_DESCRIPTION }),
  decision: Schema.optional(
    Schema.Literals(["approve", "decline"]).annotate({ description: RESUME_DECISION_DESCRIPTION })
  ),
});

export type ResumeInputDecoded = Schema.Schema.Type<typeof ResumeInputSchema>;

function formatParseError(err: Schema.SchemaError): Error {
  const formatted = SchemaIssue.makeFormatterStandardSchemaV1()(err.issue);
  return new Error(JSON.stringify(formatted.issues));
}

/** Decode unknown MCP search args into {@link SearchInputDecoded}. */
export function decodeSearchInput(raw: unknown): Effect.Effect<SearchInputDecoded, Error> {
  return Schema.decodeUnknownEffect(SearchInputSchema)(raw).pipe(Effect.mapError(formatParseError));
}

/** Decode unknown MCP execute args into {@link ExecuteInputDecoded}. */
export function decodeExecuteInput(raw: unknown): Effect.Effect<ExecuteInputDecoded, Error> {
  return Schema.decodeUnknownEffect(ExecuteInputSchema)(raw).pipe(
    Effect.mapError(formatParseError)
  );
}

/** Decode unknown MCP resume args into {@link ResumeInputDecoded}. */
export function decodeResumeInput(raw: unknown): Effect.Effect<ResumeInputDecoded, Error> {
  return Schema.decodeUnknownEffect(ResumeInputSchema)(raw).pipe(Effect.mapError(formatParseError));
}
