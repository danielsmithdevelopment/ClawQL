/**
 * In-process observability for Cuckoo membership (issue #30): rebuild events + optional
 * lookup verification against `vault_chunk` to estimate false-positive rate.
 */

export type CuckooRebuildInfo = {
  at: string;
  chunkKeyCount: number;
  fingerprintBits: number;
  bucketCount: number;
  filterSlotOccupancy: number;
};

let rebuildCount = 0;
let lastRebuild: CuckooRebuildInfo | null = null;

/** When filter says "maybe", verified against SQLite (requires extra SELECT). */
let lookups = 0;
let filterNegative = 0;
let filterMaybe = 0;
let verifiedInDb = 0;
let falsePositives = 0;

export function cuckooMetricsEnabled(): boolean {
  return process.env.CLAWQL_CUCKOO_METRICS?.trim() === "1";
}

export function recordCuckooRebuild(info: CuckooRebuildInfo): void {
  rebuildCount += 1;
  lastRebuild = info;
}

export function recordCuckooLookup(args: {
  filterSaysMaybe: boolean;
  /** When filterSaysMaybe, whether `vault_chunk` contains this id. */
  presentInDb: boolean;
}): void {
  lookups += 1;
  if (!args.filterSaysMaybe) {
    filterNegative += 1;
    return;
  }
  filterMaybe += 1;
  if (args.presentInDb) {
    verifiedInDb += 1;
  } else {
    falsePositives += 1;
  }
}

export function getCuckooMetricsSnapshot(): Record<string, unknown> {
  const fpDenom = falsePositives + verifiedInDb;
  const estimatedFpr = fpDenom > 0 ? falsePositives / fpDenom : lookups > 0 ? 0 : null;
  return {
    rebuildCount,
    lastRebuild,
    lookups,
    filterNegative,
    filterMaybe,
    verifiedInDb,
    falsePositives,
    /** Empirical: FP / (FP + TP) among filter-maybe lookups only. */
    estimatedFalsePositiveRateAmongMaybes: estimatedFpr,
  };
}

/** @internal */
export function resetCuckooMetricsForTests(): void {
  rebuildCount = 0;
  lastRebuild = null;
  lookups = 0;
  filterNegative = 0;
  filterMaybe = 0;
  verifiedInDb = 0;
  falsePositives = 0;
}
