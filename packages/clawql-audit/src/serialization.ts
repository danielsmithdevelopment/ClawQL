/**
 * WORM entry byte encoding for the hash dialect (RFC 8949 CBOR or legacy JSON).
 * Persistence backends may still store JSON; that is not this path.
 */

import { createHash } from "node:crypto";
import cbor from "cbor";
import { Context, Effect, Layer } from "effect";
import type { WORMEntry } from "./entry.js";

/** Sealed content that participates in the hash (excludes hash / acks / tee). */
export type WORMEntryPayload = Omit<WORMEntry, "hash" | "backendAcks" | "teeSignature">;

export type WormSerializationVersion = "json" | "cbor";

/**
 * Chain-level serialization marker (one switch, not per-entry).
 * @see docs/audit/clawql-audit-cbor-serialization-v0.1.md §5
 */
export type ChainMetadata = {
  serializationVersion: WormSerializationVersion;
  /** First index using `serializationVersion` after a one-time switch; null = whole chain. */
  versionChangedAtIndex: number | null;
};

export const DEFAULT_CBOR_CHAIN_METADATA: ChainMetadata = {
  serializationVersion: "cbor",
  versionChangedAtIndex: null,
};

export const LEGACY_JSON_CHAIN_METADATA: ChainMetadata = {
  serializationVersion: "json",
  versionChangedAtIndex: null,
};

/** Deep key-sort for deterministic JSON hashing (legacy dialect). */
export const sortKeysDeep = (value: unknown): unknown => {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortKeysDeep(obj[key]);
  }
  return out;
};

/**
 * Drop `undefined` so the hash dialect matches `JSON.stringify` persistence
 * round-trips (SQLite/Postgres/S3). CBOR otherwise encodes JS `undefined` as 0xf7.
 */
export const stripUndefinedDeep = (value: unknown): unknown => {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => {
      const next = stripUndefinedDeep(item);
      return next === undefined ? null : next;
    });
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const next = stripUndefinedDeep(obj[key]);
    if (next !== undefined) out[key] = next;
  }
  return out;
};

export const canonicalJSONSync = (value: unknown): string =>
  JSON.stringify(sortKeysDeep(stripUndefinedDeep(value)));

/**
 * Format in effect at `chainIndex` given one switch point.
 * Indices strictly before `versionChangedAtIndex` use the previous dialect.
 */
export const formatAtIndex = (
  meta: ChainMetadata,
  chainIndex: number
): WormSerializationVersion => {
  if (meta.versionChangedAtIndex === null) {
    return meta.serializationVersion;
  }
  const after = meta.serializationVersion;
  const before: WormSerializationVersion = after === "cbor" ? "json" : "cbor";
  return chainIndex < meta.versionChangedAtIndex ? before : after;
};

/**
 * Greenfield / unspecified → CBOR. Legacy JSON chains must pass explicit metadata.
 */
export const resolveChainMetadata = (
  explicit: ChainMetadata | undefined,
  _tip: WORMEntry | null = null
): ChainMetadata => {
  if (explicit) return explicit;
  return DEFAULT_CBOR_CHAIN_METADATA;
};

export const serializeWormEntry = (
  entry: WORMEntryPayload,
  version: WormSerializationVersion = "cbor"
): Effect.Effect<Uint8Array> =>
  Effect.sync(() => {
    const normalized = stripUndefinedDeep(entry) as WORMEntryPayload;
    if (version === "cbor") {
      return new Uint8Array(cbor.encodeCanonical(normalized));
    }
    return new TextEncoder().encode(canonicalJSONSync(normalized));
  });

export const deserializeWormEntry = (
  bytes: Uint8Array,
  version: WormSerializationVersion = "cbor"
): Effect.Effect<WORMEntryPayload> =>
  Effect.sync(() => {
    if (version === "cbor") {
      return cbor.decodeFirstSync(Buffer.from(bytes)) as WORMEntryPayload;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as WORMEntryPayload;
  });

export const sha256HexBytes = (input: Uint8Array): Effect.Effect<string> =>
  Effect.sync(() => createHash("sha256").update(input).digest("hex"));

export class WormSerialization extends Context.Tag("clawql-audit/WormSerialization")<
  WormSerialization,
  {
    readonly metadata: ChainMetadata;
    readonly formatAt: (chainIndex: number) => WormSerializationVersion;
    readonly serialize: (
      entry: WORMEntryPayload,
      version?: WormSerializationVersion
    ) => Effect.Effect<Uint8Array>;
    readonly deserialize: (
      bytes: Uint8Array,
      version?: WormSerializationVersion
    ) => Effect.Effect<WORMEntryPayload>;
    readonly hashPayload: (
      entry: WORMEntryPayload,
      version: WormSerializationVersion
    ) => Effect.Effect<string>;
  }
>() {}

export const makeWormSerializationLayer = (
  metadata: ChainMetadata
): Layer.Layer<WormSerialization> =>
  Layer.sync(WormSerialization, () =>
    WormSerialization.of({
      metadata,
      formatAt: (chainIndex) => formatAtIndex(metadata, chainIndex),
      serialize: (entry, version = metadata.serializationVersion) =>
        serializeWormEntry(entry, version),
      deserialize: (bytes, version = metadata.serializationVersion) =>
        deserializeWormEntry(bytes, version),
      hashPayload: (entry, version) =>
        Effect.gen(function* () {
          const bytes = yield* serializeWormEntry(entry, version);
          return yield* sha256HexBytes(bytes);
        }),
    })
  );
