/**
 * Authoritative Effect Schema for MCP `cache` tool inputs.
 * Tagged union replaces Zod `superRefine` and matches {@link CacheOperationInput}.
 */

import { Effect, Schema, SchemaIssue } from "effect";
import type { CacheOperationInput } from "./types.js";

export const CACHE_OPERATION_DESCRIPTION =
  "set | get | delete | list | search — ephemeral in-process KV (LRU eviction when full); not vault memory (use memory_ingest / memory_recall to persist).";

export const CACHE_KEY_DESCRIPTION = "Key for set, get, delete (UTF-8 string).";
export const CACHE_VALUE_DESCRIPTION =
  "Value for set (size capped by CLAWQL_CACHE_MAX_VALUE_BYTES).";
export const CACHE_PREFIX_DESCRIPTION =
  "For list: only keys starting with this prefix (default all).";
export const CACHE_QUERY_DESCRIPTION = "For search: case-insensitive substring match against keys.";
export const CACHE_LIMIT_DESCRIPTION =
  "For list/search: max results (defaults: list 100, search 50).";

const CacheKey = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(Schema.isMaxLength(2048))
).annotate({
  description: CACHE_KEY_DESCRIPTION,
});

const CacheLimit = Schema.Number.pipe(
  Schema.check(Schema.isInt()),
  Schema.check(Schema.isBetween({ minimum: 1, maximum: 1000 }))
).annotate({
  description: CACHE_LIMIT_DESCRIPTION,
});

export const CacheInputSchema = Schema.Union([
  Schema.Struct({
    operation: Schema.Literal("set"),
    key: CacheKey,
    value: Schema.String.annotate({ description: CACHE_VALUE_DESCRIPTION }),
  }),
  Schema.Struct({
    operation: Schema.Literal("get"),
    key: CacheKey,
  }),
  Schema.Struct({
    operation: Schema.Literal("delete"),
    key: CacheKey,
  }),
  Schema.Struct({
    operation: Schema.Literal("list"),
    prefix: Schema.optional(
      Schema.String.pipe(Schema.check(Schema.isMaxLength(2048))).annotate({
        description: CACHE_PREFIX_DESCRIPTION,
      })
    ),
    limit: Schema.optional(CacheLimit),
  }),
  Schema.Struct({
    operation: Schema.Literal("search"),
    query: Schema.String.pipe(
      Schema.check(Schema.isMinLength(1)),
      Schema.check(Schema.isMaxLength(512))
    ).annotate({
      description: CACHE_QUERY_DESCRIPTION,
    }),
    limit: Schema.optional(CacheLimit),
  }),
]).annotate({ description: CACHE_OPERATION_DESCRIPTION });

export type CacheInputDecoded = Schema.Schema.Type<typeof CacheInputSchema>;

/** Compile-time alignment with the Effect cache operation program. */
const _cacheInputAssignability: CacheInputDecoded extends CacheOperationInput ? true : false = true;
void _cacheInputAssignability;

function formatParseError(err: Schema.SchemaError): Error {
  const formatted = SchemaIssue.makeFormatterStandardSchemaV1()(err.issue);
  return new Error(JSON.stringify(formatted.issues));
}

export function decodeCacheInput(raw: unknown): Effect.Effect<CacheInputDecoded, Error> {
  return Schema.decodeUnknownEffect(CacheInputSchema)(raw).pipe(Effect.mapError(formatParseError));
}
