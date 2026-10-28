/**
 * Measure the disk's fsync ceiling once before a SHARED_HOST campaign.
 *
 * Under group_commit(batchMax=B), theoretical durable-rate max ≈ B × fsyncs/sec.
 * Both systems should report sustainablePerSec as a fraction of that ceiling.
 *
 *   node scripts/benchmarks/program-density/measure-fsync-ceiling.mjs
 *   CLAWQL_DENSITY_FSYNC_DIR=/path npm run benchmark:program-density-fsync-ceiling
 *
 * Prefers `fio` (sync engine, 4 KiB write + fsync each). Falls back to a Node
 * open/write/fsync loop when fio is missing.
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
const runtimeSec = Number(process.env.CLAWQL_DENSITY_FSYNC_RUNTIME_SEC || 15);
const batchMax = Number(process.env.CLAWQL_DENSITY_FLUSH_BATCH_MAX || 64);
const bs = Number(process.env.CLAWQL_DENSITY_FSYNC_BS || 4096);

mkdirSync(workDir, { recursive: true });

function whichFio() {
  const r = spawnSync("fio", ["--version"], { encoding: "utf8" });
  return r.status === 0 ? (r.stdout || r.stderr || "fio").trim() : null;
}

function measureWithFio() {
  const jobDir = join(workDir, "fio");
  mkdirSync(jobDir, { recursive: true });
  const jsonOut = join(workDir, "fio-result.json");
  const args = [
    "--name=fsync_ceiling",
    `--directory=${jobDir}`,
    "--ioengine=sync",
    "--rw=write",
    `--bs=${bs}`,
    "--size=4m",
    "--numjobs=1",
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
    throw new Error(`fio failed: ${r.stderr || r.stdout || r.status}`);
  }
  let rawText = r.stdout;
  if (existsSync(jsonOut)) rawText = readFileSync(jsonOut, "utf8");
  const raw = JSON.parse(rawText);
  const job = raw.jobs?.[0];
  const write = job?.write || {};
  const iops = Number(write.iops || 0);
  const bwBytes = Number(write.bw_bytes || (write.bw ? write.bw * 1024 : 0) || 0);
  return {
    method: "fio",
    fioVersion: whichFio(),
    fsyncsPerSec: Math.round(iops),
    writeIops: iops,
    writeBandwidthBytesPerSec: bwBytes,
    runtimeSec: Number(job?.job_runtime ? job.job_runtime / 1000 : runtimeSec),
    rawSummary: {
      io_bytes: write.io_bytes ?? null,
      lat_ns_mean: write.lat_ns?.mean ?? null,
    },
  };
}

function measureWithNode() {
  const file = join(workDir, "node-fsync.bin");
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
  const elapsedNs = Number(process.hrtime.bigint() - t0);
  closeSync(fd);
  const elapsedSec = elapsedNs / 1e9;
  return {
    method: "node_open_write_fsync",
    fioVersion: null,
    fsyncsPerSec: Math.round(n / elapsedSec),
    writeIops: n / elapsedSec,
    writeBandwidthBytesPerSec: (n * bs) / elapsedSec,
    runtimeSec: elapsedSec,
    rawSummary: { ops: n },
  };
}

const fioVer = whichFio();
let measured;
try {
  measured = fioVer ? measureWithFio() : measureWithNode();
} catch (err) {
  console.error(String(err));
  measured = measureWithNode();
}

const theoreticalMaxGroupCommitPerSec = measured.fsyncsPerSec * batchMax;

const payload = {
  kind: "durable-agent-density-fsync-ceiling",
  measuredAt: new Date().toISOString(),
  contract: "docs/benchmarks/program-density/SHARED_HOST.md",
  host: {
    label: process.env.CLAWQL_DENSITY_HOST_LABEL || `clawql-cloud-agent-host:${hostname()}`,
    hostname: hostname(),
    workDir,
  },
  probe: {
    blockSizeBytes: bs,
    runtimeSec,
    fsyncEachWrite: true,
    ...measured,
  },
  flushPolicy: {
    mode: "group_commit",
    batchMax,
    note: "theoreticalMaxGroupCommitPerSec = fsyncsPerSec × batchMax (assumes full batches).",
  },
  fsyncsPerSec: measured.fsyncsPerSec,
  theoreticalMaxGroupCommitPerSec,
  reading: {
    use: "Measure once on the shared host before either system runs. Report each system's sustainablePerSec as a fraction of theoreticalMaxGroupCommitPerSec. If both land near the ceiling, they are equal and the disk is the limit.",
  },
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);

// Keep work dir for inspection; optional clean via env.
if (process.env.CLAWQL_DENSITY_FSYNC_CLEAN === "1" && existsSync(workDir)) {
  rmSync(workDir, { recursive: true, force: true });
}

console.log(
  JSON.stringify(
    {
      out: outPath,
      method: measured.method,
      fsyncsPerSec: payload.fsyncsPerSec,
      batchMax,
      theoreticalMaxGroupCommitPerSec,
    },
    null,
    2
  )
);
