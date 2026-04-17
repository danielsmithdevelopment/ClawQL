/**
 * In-process cache for deserialized `memory.db` artifacts (Cuckoo filter, Merkle row).
 * Same idea as the MCP `cache` tool (`clawql-cache.ts`): ephemeral, per-process, invalidated when the
 * backing file changes. Keys include `mtimeMs` + `size` so any `persistDb` write misses the cache.
 */

import type { CuckooFilter } from "./cuckoo-filter.js";

export type MerkleSnapshotRow = {
  rootHex: string;
  leafCount: number;
  treeHeight: number;
  builtAt: string;
};

type MerkleCacheEntry = { sig: string; row: MerkleSnapshotRow | null };
type CuckooCacheEntry = { sig: string; filter: CuckooFilter };

const merkleByAbsDb = new Map<string, MerkleCacheEntry>();
const cuckooByAbsDb = new Map<string, CuckooCacheEntry>();

/** Test helper — clears artifact caches so vitest cases do not leak state. */
export function resetMemoryDbArtifactCachesForTests(): void {
  merkleByAbsDb.clear();
  cuckooByAbsDb.clear();
}

/** Call after writing `memory.db` (e.g. `persistDb`) so readers reload. */
export function invalidateMemoryDbArtifactCaches(absDbPath: string): void {
  merkleByAbsDb.delete(absDbPath);
  cuckooByAbsDb.delete(absDbPath);
}

export function getCachedMerkleSnapshot(
  absDbPath: string,
  sig: string
): MerkleSnapshotRow | null | undefined {
  const e = merkleByAbsDb.get(absDbPath);
  if (!e || e.sig !== sig) return undefined;
  return e.row;
}

export function setCachedMerkleSnapshot(
  absDbPath: string,
  sig: string,
  row: MerkleSnapshotRow | null
): void {
  merkleByAbsDb.set(absDbPath, { sig, row });
}

export function getCachedCuckooFilter(absDbPath: string, sig: string): CuckooFilter | undefined {
  const e = cuckooByAbsDb.get(absDbPath);
  if (!e || e.sig !== sig) return undefined;
  return e.filter;
}

export function setCachedCuckooFilter(absDbPath: string, sig: string, filter: CuckooFilter): void {
  cuckooByAbsDb.set(absDbPath, { sig, filter });
}
