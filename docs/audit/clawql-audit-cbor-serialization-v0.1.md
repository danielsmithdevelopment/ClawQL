---
title: "clawql-audit — CBOR Serialization Addition"
status: "September 2026"
version: "0.1"
package: "packages/clawql-audit/"
---

# clawql-audit — CBOR WORM Serialization

**Addition to the existing clawql-audit specification. Hash-chain mechanics unchanged.**

---

## 1. What changes and what doesn't

**Changes:** the byte encoding of a WORM entry, before it's hashed and appended to the chain.

**Does not change:** the hash chain algorithm (SHA-256 over sealed content that already includes `prevHash` + `chainIndex`), the `HashChain`/`MerkleBatchLayer` split, `DualAckReplicator`, tip-loading on startup, or any entry's field structure. Every WORM entry type keeps its exact field shape. Only the serialization format underneath changes.

Storage backends may still persist entries as JSON for query convenience; that persistence encoding is **not** the hash dialect.

---

## 2. Why CBOR, specifically for this structure

WORM entries are the single highest-volume, most write-frequent structure in the whole system — every hook firing, every tool call, every org provisioning event produces one. CBOR (RFC 8949) is self-describing like JSON (no `.proto` schema-compilation step needed — existing JSON-shaped entry types map over directly) but binary, producing smaller payloads and faster parse/hash cycles than JSON at this volume.

This is not the same class of change as adopting gRPC/protobuf elsewhere — no schema design, no code generation, no transport change. It's a drop-in serialization swap underneath an unchanged data model.

**Implementation note:** hashing uses the existing `cbor` dependency (already required for QR air-gap export) with **canonical** encoding (`encodeCanonical`), not a second CBOR library. The public API matches `serializeWormEntry` / `deserializeWormEntry` as Effect programs.

---

## 3. Where CBOR is used and where it explicitly is not

**Used:**

- WORM entry serialization, before hashing (`HashChain` / `sealHashChainRecord`)
- Skill index entries (plugin architecture — lightweight metadata tier; out of scope for this package)

**Not used, and this boundary is deliberate:**

- Skill/document _content_ (SKILL.md bodies, vault entries) — stays human-readable Markdown/text
- Anything returned directly into a model's context (`execute` responses, tool results) — the consumer is the LLM, not a machine-to-machine wire; JSON/text stays here
- `mcp-api-adapter`'s gRPC surface — already protobuf, no reason to add a second binary format alongside it
- QR chunk wrappers remain a separate pipeline (CBOR of entry arrays for air-gap export) — not the per-entry hash dialect

---

## 4. Implementation

```typescript
// packages/clawql-audit/src/serialization.ts — Effect primary API

import { encodeCanonical, decode } from "cbor"; // package: cbor (canonical)

export type WORMEntryPayload = Omit<
  WORMEntry,
  "hash" | "backendAcks" | "teeSignature"
>;

export const serializeWormEntry = (
  entry: WORMEntryPayload,
  version: "json" | "cbor" = "cbor"
): Effect.Effect<Uint8Array> =>
  Effect.sync(() =>
    version === "cbor"
      ? new Uint8Array(encodeCanonical(entry))
      : new TextEncoder().encode(canonicalJSONSync(entry))
  );

export const deserializeWormEntry = (
  bytes: Uint8Array,
  version: "json" | "cbor" = "cbor"
): Effect.Effect<WORMEntryPayload> =>
  Effect.sync(() =>
    version === "cbor"
      ? (decode(bytes) as WORMEntryPayload)
      : (JSON.parse(new TextDecoder().decode(bytes)) as WORMEntryPayload)
  );
```

```typescript
// packages/clawql-audit/src/seal.ts — unchanged link fields; serialization swap only

export const sealHashChainRecord = (input: {
  prev: SealPrev;
  body: SealBody;
  serializationVersion?: WormSerializationVersion;
}): Effect.Effect<Omit<WORMEntry, "backendAcks">> =>
  Effect.gen(function* () {
    const chainIndex = input.prev ? input.prev.seq + 1 : 0;
    const prevHash = input.prev ? input.prev.hash : WORM_GENESIS_PREV_HASH;
    const content = { ...input.body, prevHash, chainIndex };
    const version = input.serializationVersion ?? "cbor";
    const serialized = yield* serializeWormEntry(content, version);
    const hash = yield* sha256HexBytes(serialized);
    return { ...content, hash };
  });
```

No other function in the dual-ack replicator or Merkle batch layer changes. They operate on the resulting hash and stored entry identically regardless of what format produced the hash bytes.

---

## 5. Migration

Existing JSON-serialized entries in an already-running chain are not re-encoded retroactively — the hash chain's integrity depends on entries being hashed exactly as they were originally serialized. New entries after this change use CBOR; a chain verifier needs to know which serialization format was in effect at a given point in the chain (a version marker on the chain itself, not per-entry, since the switch happens once).

```typescript
interface ChainMetadata {
  serializationVersion: "json" | "cbor";
  versionChangedAtIndex: number | null;
}
```

**Resolution defaults** (`WORMAuditTrailConfig.chainMetadata`):

- Explicit `chainMetadata` always wins.
- When omitted → `{ serializationVersion: "cbor", versionChangedAtIndex: null }` (greenfield default).
- Legacy JSON-only chains must pass `{ serializationVersion: "json", versionChangedAtIndex: null }` (or `LEGACY_JSON_CHAIN_METADATA`).
- One-time switch to CBOR: set `serializationVersion: "cbor"` and `versionChangedAtIndex` to the first CBOR entry's `chainIndex`. Indices below that recompute with JSON; at/after use CBOR.

---

_clawql-audit CBOR Serialization Addition · v0.1 · September 2026_
