import { createHash, randomBytes } from "node:crypto";
import { Effect } from "effect";
import { WORM_GENESIS_PREV_HASH, type WORMEntry } from "./entry.js";

/** UUID v7 (time-ordered). Primary API is Effect; sync helper for seal path. */
export const generateUUIDv7 = (): Effect.Effect<string> =>
  Effect.sync(() => {
    const ms = BigInt(Date.now());
    const bytes = randomBytes(16);
    // 48-bit unix timestamp ms
    bytes[0] = Number((ms >> 40n) & 0xffn);
    bytes[1] = Number((ms >> 32n) & 0xffn);
    bytes[2] = Number((ms >> 24n) & 0xffn);
    bytes[3] = Number((ms >> 16n) & 0xffn);
    bytes[4] = Number((ms >> 8n) & 0xffn);
    bytes[5] = Number(ms & 0xffn);
    // version 7
    bytes[6] = (bytes[6]! & 0x0f) | 0x70;
    // RFC 4122 variant
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Buffer.from(bytes).toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  });

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortKeys(obj[key]);
  }
  return out;
}

/** Canonical JSON bytes for hashing (deterministic key order). */
export const canonicalJSON = (value: unknown): Effect.Effect<string> =>
  Effect.sync(() => JSON.stringify(sortKeys(value)));

export const sha256Hex = (input: string): Effect.Effect<string> =>
  Effect.sync(() => createHash("sha256").update(input, "utf8").digest("hex"));

export type SealPrev = { hash: string; seq: number } | null;

export type SealBody = Omit<WORMEntry, "hash" | "prevHash" | "chainIndex" | "backendAcks">;

/**
 * Canonical hash-chain seal — one dialect for all callers.
 * Do not reimplement prevHash / chainIndex / hash elsewhere.
 */
export const sealHashChainRecord = (input: {
  prev: SealPrev;
  body: SealBody;
}): Effect.Effect<Omit<WORMEntry, "backendAcks">> =>
  Effect.gen(function* () {
    const chainIndex = input.prev ? input.prev.seq + 1 : 0;
    const prevHash = input.prev ? input.prev.hash : WORM_GENESIS_PREV_HASH;
    const content = {
      ...input.body,
      prevHash,
      chainIndex,
    };
    const json = yield* canonicalJSON(content);
    const hash = yield* sha256Hex(json);
    return { ...content, hash };
  });

/** Recompute content hash for verify (excludes hash, backendAcks; teeSignature excluded from hash body). */
export const recomputeEntryHash = (entry: WORMEntry): Effect.Effect<string> =>
  Effect.gen(function* () {
    const { hash: _h, backendAcks: _a, teeSignature: _t, ...content } = entry;
    const json = yield* canonicalJSON(content);
    return yield* sha256Hex(json);
  });
