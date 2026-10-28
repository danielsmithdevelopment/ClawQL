/**
 * Host metrics for the fair density board (RSS, page cache, GC pauses, heap).
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { PerformanceObserver, performance, type PerformanceEntry } from "node:perf_hooks";
import { cpus, hostname, totalmem } from "node:os";
import { Effect } from "effect";
import type { GcPauseSummary, HeapSnapshot } from "./types.js";

export type ProcessRss = {
  readonly rssKiB: number;
  readonly pid: number;
};

export function readProcessRssEffect(pid = process.pid): Effect.Effect<ProcessRss> {
  return Effect.sync(() => {
    try {
      const status = readFileSync(`/proc/${pid}/status`, "utf8");
      const m = /^VmRSS:\s+(\d+)\s+kB/m.exec(status);
      if (m) return { rssKiB: Number(m[1]), pid };
    } catch {
      /* fall through */
    }
    const mu = process.memoryUsage();
    return { rssKiB: Math.round(mu.rss / 1024), pid };
  });
}

export function readMemTotalKiBEffect(): Effect.Effect<number> {
  return Effect.sync(() => Math.round(totalmem() / 1024));
}

export function readCachedKiBEffect(): Effect.Effect<number | null> {
  return Effect.sync(() => {
    try {
      const meminfo = readFileSync("/proc/meminfo", "utf8");
      const m = /^Cached:\s+(\d+)\s+kB/m.exec(meminfo);
      return m ? Number(m[1]) : null;
    } catch {
      return null;
    }
  });
}

export function forceGcEffect(): Effect.Effect<boolean> {
  return Effect.sync(() => {
    const gc = (globalThis as { gc?: () => void }).gc;
    if (typeof gc !== "function") return false;
    gc();
    return true;
  });
}

export function readHeapSnapshotEffect(): Effect.Effect<HeapSnapshot> {
  return Effect.gen(function* () {
    yield* forceGcEffect();
    const mu = process.memoryUsage();
    const rss = yield* readProcessRssEffect();
    return {
      rssKiB: rss.rssKiB,
      heapUsedKiB: Math.round(mu.heapUsed / 1024),
      heapTotalKiB: Math.round(mu.heapTotal / 1024),
      externalKiB: Math.round(mu.external / 1024),
      arrayBuffersKiB: Math.round(mu.arrayBuffers / 1024),
    };
  });
}

export type GcRecorder = {
  readonly start: () => void;
  readonly stop: () => GcPauseSummary;
  readonly disconnect: () => void;
};

/**
 * Record GC pauses via PerformanceObserver during a timed window.
 * Entries are duration-ms of GC work that landed while the recorder was active.
 */
export function createGcRecorderEffect(): Effect.Effect<GcRecorder> {
  return Effect.sync(() => {
    const pending: PerformanceEntry[] = [];
    let active = false;
    const obs = new PerformanceObserver((list) => {
      if (!active) return;
      for (const entry of list.getEntries()) {
        if (entry.entryType === "gc") pending.push(entry);
      }
    });
    try {
      obs.observe({ entryTypes: ["gc"], buffered: false });
    } catch {
      // Some runtimes disallow gc entry types; recorder then reports zeros.
    }
    return {
      start: () => {
        pending.length = 0;
        active = true;
        // Clear any buffered marks so the window starts clean.
        try {
          performance.clearMarks?.();
        } catch {
          /* ignore */
        }
      },
      stop: () => {
        active = false;
        // Drain any late notifications.
        const durations = pending.map((e) => e.duration);
        pending.length = 0;
        if (durations.length === 0) {
          return { count: 0, totalMs: 0, maxMs: 0 };
        }
        const totalMs = durations.reduce((a, b) => a + b, 0);
        return {
          count: durations.length,
          totalMs: Number(totalMs.toFixed(6)),
          maxMs: Number(Math.max(...durations).toFixed(6)),
        };
      },
      disconnect: () => {
        active = false;
        obs.disconnect();
      },
    };
  });
}

/**
 * Best-effort page-cache KiB attributable to bag files (mincore via Python).
 * Samples up to `sampleFiles` bags and extrapolates to the full directory.
 * Returns null when the helper cannot run.
 */
export function measureBagPageCacheKiBEffect(
  bagDir: string,
  sampleFiles = 2_000,
  /** Known population size — avoids a full directory materialization. */
  knownTotalFiles?: number
): Effect.Effect<number | null> {
  return Effect.sync(() => {
    const py = `
import os, sys, mmap, ctypes, ctypes.util
from pathlib import Path
root = Path(${JSON.stringify(bagDir)})
sample_n = ${Number(sampleFiles)}
known_total = ${knownTotalFiles == null ? "None" : Number(knownTotalFiles)}
if not root.is_dir():
    print("null"); sys.exit(0)
# Reservoir / stride sample without sorting millions of paths.
paths = []
total_seen = 0
for p in root.glob("bag_*.json"):
    total_seen += 1
    if len(paths) < sample_n:
        paths.append(p)
    else:
        # periodic replace to spread across the directory walk
        if total_seen % max(1, total_seen // sample_n) == 0:
            paths[total_seen % sample_n] = p
total_files = known_total if known_total is not None else total_seen
if total_files == 0 or not paths:
    print(0); sys.exit(0)
libc = ctypes.CDLL(ctypes.util.find_library("c"), use_errno=True)
pagesize = os.sysconf("SC_PAGE_SIZE")
resident = 0
ok = 0
for p in paths:
    try:
        fd = os.open(p, os.O_RDWR)
    except OSError:
        continue
    try:
        size = os.fstat(fd).st_size
        if size <= 0:
            continue
        mm = mmap.mmap(fd, size, access=mmap.ACCESS_WRITE)
        try:
            vec_len = (size + pagesize - 1) // pagesize
            vec = (ctypes.c_ubyte * vec_len)()
            addr = ctypes.addressof(ctypes.c_char.from_buffer(mm))
            rc = libc.mincore(
                ctypes.c_void_p(addr),
                ctypes.c_size_t(size),
                ctypes.cast(vec, ctypes.POINTER(ctypes.c_ubyte)),
            )
            if rc != 0:
                continue
            for b in vec:
                if b & 1:
                    resident += pagesize
            ok += 1
        finally:
            mm.close()
    finally:
        os.close(fd)
if ok == 0:
    print("null"); sys.exit(0)
scale = total_files / ok
print(int((resident * scale) // 1024))
`;
    const res = spawnSync("python3", ["-c", py], { encoding: "utf8", timeout: 300_000 });
    if (res.status !== 0) return null;
    const out = (res.stdout || "").trim();
    if (out === "null" || out === "") return null;
    const n = Number(out);
    return Number.isFinite(n) ? n : null;
  });
}

/**
 * Evict bag pages from the page cache (posix_fadvise DONTNEED). Cold-wake prep.
 * Prefer `paths` = the timed wake sample only — full-directory eviction at
 * multi-million scale is not required to measure cold wake of the sample.
 */
export function evictBagPageCacheEffect(
  bagDir: string,
  paths?: readonly string[]
): Effect.Effect<{
  readonly ok: boolean;
  readonly method: string;
  readonly detail: string;
}> {
  return Effect.sync(() => {
    const pathList = paths && paths.length > 0 ? [...paths] : null;
    const py = pathList
      ? `
import os, sys, json
paths = json.loads(${JSON.stringify(JSON.stringify(pathList))})
n = 0
for p in paths:
    fd = os.open(p, os.O_RDONLY)
    try:
        os.posix_fadvise(fd, 0, 0, os.POSIX_FADV_DONTNEED)
        n += 1
    finally:
        os.close(fd)
print(n)
`
      : `
import os, sys
from pathlib import Path
root = Path(${JSON.stringify(bagDir)})
n = 0
# Cap full-dir eviction — prefer sample paths for large boards.
for i, p in enumerate(root.glob("bag_*.json")):
    if i >= 5000:
        break
    fd = os.open(p, os.O_RDONLY)
    try:
        os.posix_fadvise(fd, 0, 0, os.POSIX_FADV_DONTNEED)
        n += 1
    finally:
        os.close(fd)
print(n)
`;
    const res = spawnSync("python3", ["-c", py], { encoding: "utf8", timeout: 300_000 });
    if (res.status !== 0) {
      return {
        ok: false,
        method: "posix_fadvise_DONTNEED",
        detail: (res.stderr || res.stdout || "evict failed").slice(0, 400),
      };
    }
    return {
      ok: true,
      method: pathList ? "posix_fadvise_DONTNEED_sample" : "posix_fadvise_DONTNEED_capped",
      detail: `advised ${(res.stdout || "").trim()} files`,
    };
  });
}

export function percentileMsEffect(samplesMs: readonly number[], p: number): Effect.Effect<number> {
  return Effect.sync(() => {
    if (samplesMs.length === 0) return 0;
    const sorted = [...samplesMs].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[idx]!;
  });
}

export function hostIdentityEffect(): Effect.Effect<{
  readonly hostname: string;
  readonly platform: string;
  readonly arch: string;
  readonly nodeVersion: string;
  readonly cpus: number;
}> {
  return Effect.sync(() => ({
    hostname: hostname(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    cpus: cpus().length,
  }));
}

export function exposeGcAvailableEffect(): Effect.Effect<boolean> {
  return Effect.sync(() => typeof (globalThis as { gc?: () => void }).gc === "function");
}

/** Available bytes on the filesystem that holds `path` (`df -B1`). */
export function readDiskAvailBytesEffect(path: string): Effect.Effect<number | null> {
  return Effect.sync(() => {
    const res = spawnSync("df", ["-B1", "--output=avail", path], { encoding: "utf8" });
    if (res.status !== 0) return null;
    const lines = (res.stdout || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    // Header "Avail" then the number.
    const raw = lines.length >= 2 ? lines[lines.length - 1]! : lines[0];
    if (!raw) return null;
    const n = Number(raw.replace(/[^0-9]/g, ""));
    return Number.isFinite(n) ? n : null;
  });
}
