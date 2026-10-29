/**
 * Disk fsync ceiling for SHARED_HOST — probe arms kept in one artifact.
 *
 * **serial (board-matched, PRIMARY):** one writer, one sync in flight —
 * write a group_commit-sized batch, fsync, wait, repeat.
 *
 * Extra arms (hypothesis: growing-file metadata makes under-load syncs slower):
 * - serialGrowingLong — same append+fsync for a longer window (board-like duration)
 * - serialFdatasync — append + fdatasync (skip unneeded metadata)
 * - serialPreallocFdatasync — fallocate segment + positioned writes + fdatasync
 *
 * **parallel (headroom only):** several writers — NOT the board ceiling.
 *
 *   npm run benchmark:program-density-fsync-ceiling
 */
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  openSync,
  writeSync,
  fsyncSync,
  fdatasyncSync,
  closeSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hostname } from "node:os";
import { spawnSync } from "node:child_process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const outArg = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
const outPath =
  outArg || join(repoRoot, "docs/benchmarks/program-density/fsync-ceiling.json");
const workDir =
  process.env.CLAWQL_DENSITY_FSYNC_DIR || "/tmp/clawql-density-fsync-ceiling";
const runtimeSec = Number(process.env.CLAWQL_DENSITY_FSYNC_RUNTIME_SEC || 10);
const longRuntimeSec = Number(
  process.env.CLAWQL_DENSITY_FSYNC_LONG_RUNTIME_SEC || Math.max(runtimeSec, 30)
);
const batchMax = Number(process.env.CLAWQL_DENSITY_FLUSH_BATCH_MAX || 64);
const parallelJobs = Number(process.env.CLAWQL_DENSITY_FSYNC_PARALLEL_JOBS || 8);
const bs = Number(process.env.CLAWQL_DENSITY_FSYNC_BS || 4096);
const preallocBytes = Number(
  process.env.CLAWQL_DENSITY_FSYNC_PREALLOC_BYTES || 256 * 1024 * 1024
);

mkdirSync(workDir, { recursive: true });

/** One NDJSON line shaped like a durable trigger record. */
const sampleLine = Buffer.from(
  '{"agentId":"bag_00000001_shared","deadlineMs":1730000000000}\n'
);
const batchBuf = Buffer.concat(Array.from({ length: batchMax }, () => sampleLine));

function percentile(samples, p) {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[idx].toFixed(4));
}

function latencySummary(samplesMs) {
  if (samplesMs.length === 0) {
    return { n: 0, meanMs: null, p50Ms: null, p99Ms: null };
  }
  const sum = samplesMs.reduce((a, b) => a + b, 0);
  return {
    n: samplesMs.length,
    meanMs: Number((sum / samplesMs.length).toFixed(4)),
    p50Ms: percentile(samplesMs, 50),
    p99Ms: percentile(samplesMs, 99),
  };
}

function whichFio() {
  const r = spawnSync("fio", ["--version"], { encoding: "utf8" });
  return r.status === 0 ? (r.stdout || r.stderr || "fio").trim() : null;
}

function preallocate(path, bytes) {
  const viaCli = spawnSync("fallocate", ["-l", String(bytes), path], { encoding: "utf8" });
  if (viaCli.status === 0) return { method: "fallocate_cli", bytes };
  const fd = openSync(path, "w");
  try {
    const chunk = Buffer.alloc(Math.min(bytes, 1024 * 1024), 0);
    let left = bytes;
    while (left > 0) {
      const n = Math.min(left, chunk.length);
      writeSync(fd, chunk, 0, n);
      left -= n;
    }
  } finally {
    closeSync(fd);
  }
  return { method: "zero_fill", bytes };
}

/**
 * Timed serial loop. syncFn(fd) is the durability call.
 * positioned=false → append; positioned=true → write at advancing offset (prealloc).
 */
function measureSerialArm({
  mode,
  method,
  pattern,
  file,
  syncFn,
  runtime,
  positioned = false,
  maxBytes = null,
  note = null,
}) {
  if (existsSync(file)) {
    try {
      unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
  let prealloc = null;
  if (positioned) {
    prealloc = preallocate(file, maxBytes);
  }
  const fd = openSync(file, positioned ? "r+" : "w");
  const latencies = [];
  const t0 = process.hrtime.bigint();
  let n = 0;
  let offset = 0;
  const deadline = t0 + BigInt(Math.ceil(runtime * 1000)) * 1_000_000n;
  while (process.hrtime.bigint() < deadline) {
    if (positioned) {
      if (offset + batchBuf.length > maxBytes) break;
      writeSync(fd, batchBuf, 0, batchBuf.length, offset);
      offset += batchBuf.length;
    } else {
      writeSync(fd, batchBuf);
    }
    const s0 = process.hrtime.bigint();
    syncFn(fd);
    latencies.push(Number(process.hrtime.bigint() - s0) / 1e6);
    n += 1;
  }
  const elapsedSec = Number(process.hrtime.bigint() - t0) / 1e9;
  closeSync(fd);
  const lat = latencySummary(latencies);
  const out = {
    mode,
    method,
    pattern,
    batchMax,
    batchBytes: batchBuf.length,
    ops: n,
    runtimeSec: elapsedSec,
    fsyncsPerSec: Math.round(n / elapsedSec),
    meanFsyncLatencyMs: lat.meanMs,
    fsyncLatencyMs: lat,
    writeBandwidthBytesPerSec: (n * batchBuf.length) / elapsedSec,
    endFileBytes: positioned ? offset : n * batchBuf.length,
  };
  if (note) out.note = note;
  if (prealloc) out.preallocate = prealloc;
  return out;
}

function measureSerialBoardMatched() {
  return measureSerialArm({
    mode: "serial_board_matched",
    method: "node_append_batch_fsync",
    pattern:
      "one writer; write(batchMax NDJSON lines); fsyncSync; wait; repeat — matches trigger-journal group_commit",
    file: join(workDir, "serial-append.ndjson"),
    syncFn: fsyncSync,
    runtime: runtimeSec,
  });
}

function measureSerialGrowingLong() {
  return measureSerialArm({
    mode: "serial_growing_long",
    method: "node_append_batch_fsync_long",
    pattern:
      "Same as serial_board_matched but longer wall time so the file grows like a board focus window — tests metadata cost of a growing journal.",
    file: join(workDir, "serial-append-long.ndjson"),
    syncFn: fsyncSync,
    runtime: longRuntimeSec,
    note: "Compare fsyncLatencyMs.p50/p99 to serial_board_matched; a 2–4× rise supports the growing-metadata hypothesis.",
  });
}

function measureSerialFdatasync() {
  return measureSerialArm({
    mode: "serial_append_fdatasync",
    method: "node_append_batch_fdatasync",
    pattern: "one writer; append batch; fdatasyncSync (data only — skips unused metadata)",
    file: join(workDir, "serial-append-fdatasync.ndjson"),
    syncFn: fdatasyncSync,
    runtime: runtimeSec,
    note: "Experimental arm — report before/after fsyncsPerSec + latency vs serial_board_matched.",
  });
}

function measureSerialPreallocFdatasync() {
  return measureSerialArm({
    mode: "serial_prealloc_fdatasync",
    method: "node_prealloc_positioned_fdatasync",
    pattern:
      "fallocate segment; positioned writes within allocated size; fdatasync — size/blocks stable across syncs",
    file: join(workDir, "serial-prealloc.bin"),
    syncFn: fdatasyncSync,
    runtime: runtimeSec,
    positioned: true,
    maxBytes: preallocBytes,
    note: "Experimental arm — if this closes most of the board-vs-probe gap, campaign should use the same sync path.",
  });
}

/** Diagnostic: overwrite same 4 KiB offset + fsync (can look much faster than append). */
function measureSerialOverwrite() {
  const file = join(workDir, "serial-overwrite.bin");
  const buf = Buffer.alloc(bs, 0x5a);
  const fd = openSync(file, "w");
  const latencies = [];
  const t0 = process.hrtime.bigint();
  let n = 0;
  const deadline = t0 + BigInt(Math.ceil(runtimeSec * 1000)) * 1_000_000n;
  while (process.hrtime.bigint() < deadline) {
    writeSync(fd, buf, 0, bs, 0);
    const s0 = process.hrtime.bigint();
    fsyncSync(fd);
    latencies.push(Number(process.hrtime.bigint() - s0) / 1e6);
    n += 1;
  }
  const elapsedSec = Number(process.hrtime.bigint() - t0) / 1e9;
  closeSync(fd);
  const lat = latencySummary(latencies);
  return {
    mode: "serial_overwrite_diagnostic",
    method: "node_overwrite_4k_fsync",
    note: "Not the board pattern — kept only to explain prior inflated probes that rewrote one offset.",
    ops: n,
    runtimeSec: elapsedSec,
    fsyncsPerSec: Math.round(n / elapsedSec),
    meanFsyncLatencyMs: lat.meanMs,
    fsyncLatencyMs: lat,
  };
}

function measureParallelFio(jobs) {
  const fioVer = whichFio();
  if (!fioVer) {
    return measureParallelNode(jobs);
  }
  const jobDir = join(workDir, `fio-parallel-${jobs}`);
  mkdirSync(jobDir, { recursive: true });
  const jsonOut = join(workDir, `fio-parallel-${jobs}.json`);
  const args = [
    "--name=fsync_parallel",
    `--directory=${jobDir}`,
    "--ioengine=sync",
    "--rw=write",
    `--bs=${bs}`,
    "--size=1m",
    `--numjobs=${jobs}`,
    "--iodepth=1",
    "--fsync=1",
    `--runtime=${runtimeSec}`,
    "--time_based=1",
    "--group_reporting=1",
    "--output-format=json",
    `--output=${jsonOut}`,
  ];
  const r = spawnSync("fio", args, { encoding: "utf8" });
  if (r.status !== 0) {
    return measureParallelNode(jobs);
  }
  const raw = JSON.parse(existsSync(jsonOut) ? readFileSync(jsonOut, "utf8") : r.stdout);
  const write = raw.jobs?.[0]?.write || {};
  const iops = Number(write.iops || 0);
  return {
    mode: "parallel_headroom",
    method: "fio",
    fioVersion: fioVer,
    pattern: `${jobs} fio jobs; each write+fsync; aggregate IOPS — NOT the group_commit ceiling`,
    numJobs: jobs,
    iodepth: 1,
    fsyncsPerSec: Math.round(iops),
    writeIops: iops,
    meanLatencyUs: write.lat_ns?.mean != null ? Number((write.lat_ns.mean / 1000).toFixed(2)) : null,
    runtimeSec,
  };
}

function measureParallelNode(jobs) {
  const workers = [];
  const t0 = process.hrtime.bigint();
  const deadline = t0 + BigInt(Math.ceil(runtimeSec * 1000)) * 1_000_000n;
  for (let j = 0; j < jobs; j++) {
    const fd = openSync(join(workDir, `parallel-${j}.bin`), "w");
    const buf = Buffer.alloc(bs, j & 0xff);
    workers.push({ fd, buf, n: 0 });
  }
  while (process.hrtime.bigint() < deadline) {
    for (const w of workers) {
      writeSync(w.fd, w.buf, 0, bs, 0);
      fsyncSync(w.fd);
      w.n += 1;
      if (process.hrtime.bigint() >= deadline) break;
    }
  }
  const elapsedSec = Number(process.hrtime.bigint() - t0) / 1e9;
  let total = 0;
  for (const w of workers) {
    total += w.n;
    closeSync(w.fd);
  }
  return {
    mode: "parallel_headroom",
    method: "node_round_robin_fallback",
    note: "Single-process round-robin — understates true multi-writer headroom; install fio for real parallel.",
    numJobs: jobs,
    fsyncsPerSec: Math.round(total / elapsedSec),
    runtimeSec: elapsedSec,
  };
}

const serial = measureSerialBoardMatched();
const serialGrowingLong = measureSerialGrowingLong();
const serialFdatasync = measureSerialFdatasync();
const serialPreallocFdatasync = measureSerialPreallocFdatasync();
const overwriteDiagnostic = measureSerialOverwrite();
const parallel = measureParallelFio(parallelJobs);

const theoreticalMaxGroupCommitPerSec = serial.fsyncsPerSec * batchMax;
const boardFloorExample = 256_000;
const fractionIfBoardFloor = Number((boardFloorExample / theoreticalMaxGroupCommitPerSec).toFixed(4));

const growingVsShort =
  serial.fsyncLatencyMs?.p50Ms && serialGrowingLong.fsyncLatencyMs?.p50Ms
    ? Number((serialGrowingLong.fsyncLatencyMs.p50Ms / serial.fsyncLatencyMs.p50Ms).toFixed(3))
    : null;
const fdatasyncVsFsync =
  serial.fsyncsPerSec && serialFdatasync.fsyncsPerSec
    ? Number((serialFdatasync.fsyncsPerSec / serial.fsyncsPerSec).toFixed(3))
    : null;
const preallocVsFsync =
  serial.fsyncsPerSec && serialPreallocFdatasync.fsyncsPerSec
    ? Number((serialPreallocFdatasync.fsyncsPerSec / serial.fsyncsPerSec).toFixed(3))
    : null;

const reading =
  serial.fsyncsPerSec <= 6_000
    ? {
        primaryCeiling: "serial_board_matched",
        verdict:
          "Serial fsyncs/sec near ~4k ⇒ group_commit theo max near ~256k. Board floor at that level is disk-shaped for a single writer.",
        action: "Read each system's sustainablePerSec as a fraction of theoreticalMaxGroupCommitPerSec (serial).",
      }
    : {
        primaryCeiling: "serial_board_matched",
        verdict:
          "Serial single-writer fsyncs/sec still far above ~4k. Board rates well below theoreticalMaxGroupCommitPerSec need under-load sync latency vs this probe — growing-file metadata is the leading suspect when producer CPU is idle.",
        action:
          "Compare flushStats.fsyncLatencyMs.p50/p99 to serial.fsyncLatencyMs. If run latency is 2–4× the probe, try fdatasync + preallocate arms on both systems before the campaign.",
      };

const payload = {
  kind: "durable-agent-density-fsync-ceiling",
  measuredAt: new Date().toISOString(),
  contract: "docs/benchmarks/program-density/SHARED_HOST.md",
  host: {
    label: process.env.CLAWQL_DENSITY_HOST_LABEL || `clawql-cloud-agent-host:${hostname()}`,
    hostname: hostname(),
    workDir,
  },
  flushPolicy: {
    mode: "group_commit",
    batchMax,
    note: "theoreticalMaxGroupCommitPerSec = serial.fsyncsPerSec × batchMax (full batches). Parallel must not be used as this ceiling.",
  },
  serial,
  serialGrowingLong,
  serialFdatasync,
  serialPreallocFdatasync,
  parallel,
  overwriteDiagnostic,
  fsyncsPerSec: serial.fsyncsPerSec,
  theoreticalMaxGroupCommitPerSec,
  fractionOfCeilingIfBoardFloor256k: fractionIfBoardFloor,
  armsCompare: {
    growingLongP50OverShortP50: growingVsShort,
    fdatasyncFsyncsPerSecOverSerial: fdatasyncVsFsync,
    preallocFdatasyncFsyncsPerSecOverSerial: preallocVsFsync,
    hypothesis:
      "Appending log + fsync forces size/allocation metadata each sync; long growing runs and board focus windows may show higher latency than a short probe. fdatasync + preallocated segments are the standard fix — report before/after sustained rate and fsyncs/sec.",
  },
  reading: {
    ...reading,
    bothSystems:
      "Ontologiql must run the same serial_board_matched probe (one writer, one sync in flight, batch-then-fsync) on the shared host before claiming disk-bound. Both sides should also compare under-load sync latency to the probe and trial fdatasync+prealloc if latency is inflated.",
    priorMistake:
      "An earlier probe that looked like ~40k fsync/s was overwrite-same-offset / parallel-capable and overstated single-writer capacity. Retracted as the group_commit ceiling.",
  },
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);

if (process.env.CLAWQL_DENSITY_FSYNC_CLEAN === "1" && existsSync(workDir)) {
  rmSync(workDir, { recursive: true, force: true });
}

console.log(
  JSON.stringify(
    {
      out: outPath,
      serialFsyncsPerSec: serial.fsyncsPerSec,
      serialLatency: serial.fsyncLatencyMs,
      growingLongFsyncsPerSec: serialGrowingLong.fsyncsPerSec,
      growingLongLatency: serialGrowingLong.fsyncLatencyMs,
      fdatasyncFsyncsPerSec: serialFdatasync.fsyncsPerSec,
      fdatasyncLatency: serialFdatasync.fsyncLatencyMs,
      preallocFdatasyncFsyncsPerSec: serialPreallocFdatasync.fsyncsPerSec,
      preallocFdatasyncLatency: serialPreallocFdatasync.fsyncLatencyMs,
      parallelFsyncsPerSec: parallel.fsyncsPerSec,
      batchMax,
      theoreticalMaxGroupCommitPerSec,
      armsCompare: payload.armsCompare,
      reading: reading.verdict,
    },
    null,
    2
  )
);
