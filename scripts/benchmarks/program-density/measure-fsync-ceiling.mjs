/**
 * Disk fsync ceiling for SHARED_HOST — two modes kept in one artifact.
 *
 * **serial (board-matched, PRIMARY):** one writer, one sync in flight —
 * write a group_commit-sized batch, fsync, wait, repeat. Matches
 * `trigger-journal.ts` (append NDJSON + fsyncSync). Use this for
 * theoreticalMaxGroupCommitPerSec = serial.fsyncsPerSec × batchMax.
 *
 * **parallel (headroom only):** several writers with fsync each — shows
 * what a multi-writer design could use. Do NOT read board rates against this.
 *
 * Both ClawQL and Ontologiql must run the same serial probe on the campaign host.
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
  closeSync,
  rmSync,
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
const batchMax = Number(process.env.CLAWQL_DENSITY_FLUSH_BATCH_MAX || 64);
const parallelJobs = Number(process.env.CLAWQL_DENSITY_FSYNC_PARALLEL_JOBS || 8);
const bs = Number(process.env.CLAWQL_DENSITY_FSYNC_BS || 4096);

mkdirSync(workDir, { recursive: true });

/** One NDJSON line shaped like a durable trigger record. */
const sampleLine = Buffer.from(
  '{"agentId":"bag_00000001_shared","deadlineMs":1730000000000}\n'
);
const batchBuf = Buffer.concat(Array.from({ length: batchMax }, () => sampleLine));

function whichFio() {
  const r = spawnSync("fio", ["--version"], { encoding: "utf8" });
  return r.status === 0 ? (r.stdout || r.stderr || "fio").trim() : null;
}

/**
 * Board-matched serial probe: append one batch, fsync, wait — repeat.
 * Single fd, no overlapping syncs.
 */
function measureSerialBoardMatched() {
  const file = join(workDir, "serial-append.ndjson");
  const fd = openSync(file, "w");
  const t0 = process.hrtime.bigint();
  let n = 0;
  const deadline = t0 + BigInt(runtimeSec) * 1_000_000_000n;
  while (process.hrtime.bigint() < deadline) {
    writeSync(fd, batchBuf);
    fsyncSync(fd);
    n += 1;
  }
  const elapsedSec = Number(process.hrtime.bigint() - t0) / 1e9;
  closeSync(fd);
  const fsyncsPerSec = n / elapsedSec;
  return {
    mode: "serial_board_matched",
    method: "node_append_batch_fsync",
    pattern:
      "one writer; write(batchMax NDJSON lines); fsyncSync; wait; repeat — matches trigger-journal group_commit",
    batchMax,
    batchBytes: batchBuf.length,
    ops: n,
    runtimeSec: elapsedSec,
    fsyncsPerSec: Math.round(fsyncsPerSec),
    meanFsyncLatencyMs: Number(((elapsedSec / n) * 1000).toFixed(4)),
    writeBandwidthBytesPerSec: (n * batchBuf.length) / elapsedSec,
  };
}

/** Diagnostic: overwrite same 4 KiB offset + fsync (can look much faster than append). */
function measureSerialOverwrite() {
  const file = join(workDir, "serial-overwrite.bin");
  const buf = Buffer.alloc(bs, 0x5a);
  const fd = openSync(file, "w");
  const t0 = process.hrtime.bigint();
  let n = 0;
  const deadline = t0 + BigInt(runtimeSec) * 1_000_000_000n;
  while (process.hrtime.bigint() < deadline) {
    writeSync(fd, buf, 0, bs, 0);
    fsyncSync(fd);
    n += 1;
  }
  const elapsedSec = Number(process.hrtime.bigint() - t0) / 1e9;
  closeSync(fd);
  return {
    mode: "serial_overwrite_diagnostic",
    method: "node_overwrite_4k_fsync",
    note: "Not the board pattern — kept only to explain prior inflated probes that rewrote one offset.",
    ops: n,
    runtimeSec: elapsedSec,
    fsyncsPerSec: Math.round(n / elapsedSec),
    meanFsyncLatencyMs: Number(((elapsedSec / n) * 1000).toFixed(4)),
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
  const deadline = t0 + BigInt(runtimeSec) * 1_000_000_000n;
  for (let j = 0; j < jobs; j++) {
    const fd = openSync(join(workDir, `parallel-${j}.bin`), "w");
    const buf = Buffer.alloc(bs, j & 0xff);
    workers.push({ fd, buf, n: 0 });
  }
  // Round-robin serial in one process still has one sync in flight globally —
  // true parallel needs threads. Prefer fio; this is a degraded fallback.
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
const overwriteDiagnostic = measureSerialOverwrite();
const parallel = measureParallelFio(parallelJobs);

const theoreticalMaxGroupCommitPerSec = serial.fsyncsPerSec * batchMax;
const boardFloorExample = 256_000;
const fractionIfBoardFloor = Number((boardFloorExample / theoreticalMaxGroupCommitPerSec).toFixed(4));

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
          "Serial single-writer fsyncs/sec still far above ~4k. Board rates well below theoreticalMaxGroupCommitPerSec are software headroom (likely CPU in the write/drain path) — not proven disk-bound. Profile the drain on both systems.",
        action:
          "Do not call ClawQL-vs-Ontologiql gaps disk-shaped until both are measured against this serial ceiling on one host. Keep parallel as multi-writer headroom only.",
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
  parallel,
  overwriteDiagnostic,
  fsyncsPerSec: serial.fsyncsPerSec,
  theoreticalMaxGroupCommitPerSec,
  fractionOfCeilingIfBoardFloor256k: fractionIfBoardFloor,
  reading: {
    ...reading,
    bothSystems:
      "Ontologiql must run the same serial_board_matched probe (one writer, one sync in flight, batch-then-fsync) on the shared host before claiming disk-bound.",
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
      serialMeanFsyncMs: serial.meanFsyncLatencyMs,
      parallelFsyncsPerSec: parallel.fsyncsPerSec,
      batchMax,
      theoreticalMaxGroupCommitPerSec,
      fractionIfBoardFloor256k: fractionIfBoardFloor,
      reading: reading.verdict,
    },
    null,
    2
  )
);
