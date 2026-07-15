/**
 * Authoritative Effect Schema for MCP `memory_sync` inputs.
 * Thin Zod edge remains in {@link ./memory-sync.js} for MCP SDK registration.
 */

import { Effect, ParseResult, Schema } from "effect";

export const MEMORY_SYNC_DIRECTION_DESCRIPTION =
  "Sync strategy. `auto` (default): pull remote changes then push local changes. `pull` or `push` run one direction only.";
export const MEMORY_SYNC_FORCE_DESCRIPTION =
  "When true, overwrite on hash conflicts. Default false — conflicts are reported only.";
export const MEMORY_SYNC_DRY_RUN_DESCRIPTION = "Plan only; do not read or write object storage.";

export const MemorySyncInputSchema = Schema.Struct({
  direction: Schema.optional(
    Schema.Literal("auto", "pull", "push").annotations({
      description: MEMORY_SYNC_DIRECTION_DESCRIPTION,
    })
  ),
  force: Schema.optional(
    Schema.Boolean.annotations({ description: MEMORY_SYNC_FORCE_DESCRIPTION })
  ),
  dryRun: Schema.optional(
    Schema.Boolean.annotations({ description: MEMORY_SYNC_DRY_RUN_DESCRIPTION })
  ),
});

export type MemorySyncInputDecoded = Schema.Schema.Type<typeof MemorySyncInputSchema>;

function formatParseError(err: ParseResult.ParseError): Error {
  return new Error(ParseResult.TreeFormatter.formatErrorSync(err));
}

export function decodeMemorySyncInput(raw: unknown): Effect.Effect<MemorySyncInputDecoded, Error> {
  return Schema.decodeUnknown(MemorySyncInputSchema)(raw).pipe(Effect.mapError(formatParseError));
}
