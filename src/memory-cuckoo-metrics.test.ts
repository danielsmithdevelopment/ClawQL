import { afterEach, describe, expect, it } from "vitest";
import {
  cuckooMetricsEnabled,
  getCuckooMetricsSnapshot,
  recordCuckooLookup,
  recordCuckooRebuild,
  resetCuckooMetricsForTests,
} from "./memory-cuckoo-metrics.js";

describe("memory-cuckoo-metrics", () => {
  const saved = process.env.CLAWQL_CUCKOO_METRICS;

  afterEach(() => {
    if (saved === undefined) delete process.env.CLAWQL_CUCKOO_METRICS;
    else process.env.CLAWQL_CUCKOO_METRICS = saved;
    resetCuckooMetricsForTests();
  });

  it("cuckooMetricsEnabled follows CLAWQL_CUCKOO_METRICS", () => {
    delete process.env.CLAWQL_CUCKOO_METRICS;
    expect(cuckooMetricsEnabled()).toBe(false);
    process.env.CLAWQL_CUCKOO_METRICS = "1";
    expect(cuckooMetricsEnabled()).toBe(true);
  });

  it("recordCuckooRebuild and recordCuckooLookup update snapshot", () => {
    resetCuckooMetricsForTests();
    recordCuckooRebuild({
      at: "2026-01-01T00:00:00.000Z",
      chunkKeyCount: 3,
      fingerprintBits: 64,
      bucketCount: 4,
      filterSlotOccupancy: 2,
    });
    recordCuckooLookup({ filterSaysMaybe: false, presentInDb: false });
    recordCuckooLookup({ filterSaysMaybe: true, presentInDb: true });
    recordCuckooLookup({ filterSaysMaybe: true, presentInDb: false });

    const snap = getCuckooMetricsSnapshot();
    expect(snap.rebuildCount).toBe(1);
    expect(snap.lookups).toBe(3);
    expect(snap.filterNegative).toBe(1);
    expect(snap.filterMaybe).toBe(2);
    expect(snap.verifiedInDb).toBe(1);
    expect(snap.falsePositives).toBe(1);
    expect(snap.estimatedFalsePositiveRateAmongMaybes).toBeCloseTo(0.5);

    resetCuckooMetricsForTests();
    const cleared = getCuckooMetricsSnapshot();
    expect(cleared.rebuildCount).toBe(0);
    expect(cleared.lookups).toBe(0);
  });
});
