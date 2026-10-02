/**
 * Authoritative Effect Schema for MCP `audit` tool inputs.
 * Tagged union replaces Zod `superRefine`; trim+nonEmpty for append fields.
 */

import { Effect, Schema, SchemaIssue } from "effect";

export const AUDIT_OPERATION_DESCRIPTION =
  "append — record a redacted hash-chained audit line; list — recent events; verify — check the retained-window hash chain; clear — empty buffer and start a new chain (operator/test).";

export const AUDIT_CATEGORY_DESCRIPTION =
  "For append: short category (e.g. tool_call, payment, policy).";
export const AUDIT_ACTION_DESCRIPTION = "For append: action name or verb.";
export const AUDIT_SUMMARY_DESCRIPTION = "For append: human-readable summary — avoid secrets.";
export const AUDIT_CORRELATION_ID_DESCRIPTION =
  "Optional id to correlate with logs or memory_ingest.";
export const AUDIT_LIMIT_DESCRIPTION = "For list: max entries (default 20).";

const NonEmptyTrimmed = (max: number) =>
  Schema.Trim.pipe(Schema.check(Schema.isNonEmpty()), Schema.check(Schema.isMaxLength(max)));

export const AuditInputSchema = Schema.Union([
  Schema.Struct({
    operation: Schema.Literal("append"),
    category: NonEmptyTrimmed(64).annotate({ description: AUDIT_CATEGORY_DESCRIPTION }),
    action: NonEmptyTrimmed(128).annotate({ description: AUDIT_ACTION_DESCRIPTION }),
    summary: NonEmptyTrimmed(512).annotate({ description: AUDIT_SUMMARY_DESCRIPTION }),
    correlationId: Schema.optional(
      Schema.Trim.pipe(
        Schema.check(Schema.isNonEmpty()),
        Schema.check(Schema.isMaxLength(128))
      ).annotate({
        description: AUDIT_CORRELATION_ID_DESCRIPTION,
      })
    ),
  }),
  Schema.Struct({
    operation: Schema.Literal("list"),
    limit: Schema.Number.pipe(
      Schema.check(Schema.isInt()),
      Schema.check(Schema.isBetween({ minimum: 1, maximum: 100 }))
    )
      .pipe(Schema.withDecodingDefaultType(Effect.succeed(20)))
      .annotate({ description: AUDIT_LIMIT_DESCRIPTION }),
  }),
  Schema.Struct({
    operation: Schema.Literal("verify"),
  }),
  Schema.Struct({
    operation: Schema.Literal("clear"),
  }),
]).annotate({ description: AUDIT_OPERATION_DESCRIPTION });

export type AuditInputDecoded = Schema.Schema.Type<typeof AuditInputSchema>;

function formatParseError(err: Schema.SchemaError): Error {
  const formatted = SchemaIssue.makeFormatterStandardSchemaV1()(err.issue);
  return new Error(JSON.stringify(formatted.issues));
}

export function decodeAuditInput(raw: unknown): Effect.Effect<AuditInputDecoded, Error> {
  return Schema.decodeUnknownEffect(AuditInputSchema)(raw).pipe(Effect.mapError(formatParseError));
}
