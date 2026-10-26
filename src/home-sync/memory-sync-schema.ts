/**
 * Authoritative Effect Schema for MCP `memory_sync` inputs.
 * Thin Zod edge remains in {@link ./memory-sync.js} for MCP SDK registration.
 */

import { Effect, Schema, SchemaIssue } from "effect";

export const MEMORY_SYNC_DIRECTION_DESCRIPTION =
  "Sync strategy. `auto` (default): pull from the remote sync manifest then push local changes (push merges remote-only manifest paths). `pull` or `push` run one direction only. Status remoteCount is the manifest size, not a raw bucket listing.";
export const MEMORY_SYNC_FORCE_DESCRIPTION =
  "When true, overwrite on hash conflicts. Default false — conflicts are reported only.";
export const MEMORY_SYNC_DRY_RUN_DESCRIPTION = "Plan only; do not read or write object storage.";

export const MemorySyncInputSchema = Schema.Struct({
  direction: Schema.optional(
    Schema.Literals(["auto", "pull", "push"]).annotate({
      description: MEMORY_SYNC_DIRECTION_DESCRIPTION,
    })
  ),
  force: Schema.optional(Schema.Boolean.annotate({ description: MEMORY_SYNC_FORCE_DESCRIPTION })),
  dryRun: Schema.optional(
    Schema.Boolean.annotate({ description: MEMORY_SYNC_DRY_RUN_DESCRIPTION })
  ),
});

export type MemorySyncInputDecoded = Schema.Schema.Type<typeof MemorySyncInputSchema>;

function formatParseError(err: Schema.SchemaError): Error {
  const formatted = SchemaIssue.makeFormatterStandardSchemaV1()(err.issue);
  return new Error(JSON.stringify(formatted.issues));
}

export function decodeMemorySyncInput(raw: unknown): Effect.Effect<MemorySyncInputDecoded, Error> {
  return Schema.decodeUnknownEffect(MemorySyncInputSchema)(raw).pipe(
    Effect.mapError(formatParseError)
  );
}
