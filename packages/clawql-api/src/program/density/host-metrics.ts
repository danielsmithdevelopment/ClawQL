/**
 * Host metrics for the fair density board (RSS, page cache, percentiles).
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { cpus, hostname, totalmem } from "node:os";
import { Effect } from "effect";

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

/**
 * Best-effort page-cache KiB attributable to bag files (mincore via Python).
 * Returns null when the helper cannot run.
 */
export function measureBagPageCacheKiBEffect(bagDir: string): Effect.Effect<number | null> {
  return Effect.sync(() => {
    const py = `
import os, sys, mmap, ctypes, ctypes.util
from pathlib import Path
root = Path(${JSON.stringify(bagDir)})
if not root.is_dir():
    print("0"); sys.exit(0)
libc = ctypes.CDLL(ctypes.util.find_library("c"), use_errno=True)
pagesize = os.sysconf("SC_PAGE_SIZE")
resident = 0
for p in sorted(root.glob("bag_*.json")):
    try:
        fd = os.open(p, os.O_RDONLY)
    except OSError:
        continue
    try:
        st = os.fstat(fd)
        size = st.st_size
        if size <= 0:
            continue
        mm = mmap.mmap(fd, size, access=mmap.ACCESS_READ)
        try:
            vec = (ctypes.c_ubyte * ((size + pagesize - 1) // pagesize))()
            if libc.mincore(ctypes.c_void_p(ctypes.addressof(ctypes.c_char.from_buffer(mm))), ctypes.c_size_t(size), vec) != 0:
                continue
            for b in vec:
                if b & 1:
                    resident += pagesize
        finally:
            mm.close()
    finally:
        os.close(fd)
print(resident // 1024)
`;
    const res = spawnSync("python3", ["-c", py], { encoding: "utf8", timeout: 120_000 });
    if (res.status !== 0) return null;
    const n = Number((res.stdout || "").trim());
    return Number.isFinite(n) ? n : null;
  });
}

/**
 * Evict bag pages from the page cache (posix_fadvise DONTNEED). Cold-wake prep.
 */
export function evictBagPageCacheEffect(bagDir: string): Effect.Effect<{
  readonly ok: boolean;
  readonly method: string;
  readonly detail: string;
}> {
  return Effect.sync(() => {
    const py = `
import os, sys
from pathlib import Path
root = Path(${JSON.stringify(bagDir)})
n = 0
for p in sorted(root.glob("bag_*.json")):
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
      method: "posix_fadvise_DONTNEED",
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
