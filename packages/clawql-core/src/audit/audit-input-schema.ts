/**
 * Authoritative Effect Schema for MCP `audit` tool inputs.
 * Tagged union replaces Zod `superRefine`; trim+nonEmpty for append fields.
 */

import { Effect, ParseResult, Schema } from "effect";

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
  Schema.Trim.pipe(Schema.nonEmptyString(), Schema.maxLength(max));

export const AuditInputSchema = Schema.Union(
  Schema.Struct({
    operation: Schema.Literal("append"),
    category: NonEmptyTrimmed(64).annotations({ description: AUDIT_CATEGORY_DESCRIPTION }),
    action: NonEmptyTrimmed(128).annotations({ description: AUDIT_ACTION_DESCRIPTION }),
    summary: NonEmptyTrimmed(512).annotations({ description: AUDIT_SUMMARY_DESCRIPTION }),
    correlationId: Schema.optional(
      Schema.Trim.pipe(Schema.nonEmptyString(), Schema.maxLength(128)).annotations({
        description: AUDIT_CORRELATION_ID_DESCRIPTION,
      })
    ),
  }),
  Schema.Struct({
    operation: Schema.Literal("list"),
    limit: Schema.optionalWith(Schema.Number.pipe(Schema.int(), Schema.between(1, 100)), {
      default: () => 20,
    }).annotations({ description: AUDIT_LIMIT_DESCRIPTION }),
  }),
  Schema.Struct({
    operation: Schema.Literal("verify"),
  }),
  Schema.Struct({
    operation: Schema.Literal("clear"),
  })
).annotations({ description: AUDIT_OPERATION_DESCRIPTION });

export type AuditInputDecoded = Schema.Schema.Type<typeof AuditInputSchema>;

function formatParseError(err: ParseResult.ParseError): Error {
  return new Error(ParseResult.TreeFormatter.formatErrorSync(err));
}

export function decodeAuditInput(raw: unknown): Effect.Effect<AuditInputDecoded, Error> {
  return Schema.decodeUnknown(AuditInputSchema)(raw).pipe(Effect.mapError(formatParseError));
}
