#!/usr/bin/env node
/**
 * Tier C phased fleet kill board — long-lived 2-node celld fleet on R2.
 *
 * Phases (write index = 2):
 *   before_intent | after_intent_before_call | during_call | after_call_before_journal
 *   + random (uniform over the four)
 *
 * Columns:
 *   duplicates          — safety
 *   outcomeUnknown      — honest uncertainty
 *   survivorSelfFences  — availability (celld exit code 3 / lease watchdog)
 *   survivorRestarts    — orchestrator recoveries (counted, not hidden)
 *   resumeDeadlineMiss  — resume not completed within deadline
 *   completed           — claim-path §1: clean program completions after resume
 *   stepsRepeated       — claim-path §1: completed write steps that re-ran on host (target 0)
 *   statePreserved      — claim-path §1: exact digest equality vs no-crash twin (outer phases)
 *   waitApproval        — claim-path §4: await_approval park survives peer kill + approve resume
 *
 * Env:
 *   FLEET_PHASED_N                   write-kill trials (default 100; lab N=1000 overall =
 *                                    write-kill + FLEET_PHASED_AWAIT_TRIALS)
 *   FLEET_PHASED_EVIDENCE            output path
 *   FLEET_PHASED_RESUME_DEADLINE_MS  resume+recovery budget (default 60000)
 *   FLEET_PHASED_AWAIT_TRIALS        await_approval kill/resume trials (default 0; lab ~250–300)
 *   FLEET_PHASED_STATE_BASELINE      1=per-outer-trial no-crash twin for statePreserved (default 1)
 *   FLEET_PHASED_SCORE_MODE          legacy_zero_deadline (default) |
 *                                    correctness_availability_v2 (split gates; see durability STATUS)
 *   FLEET_PHASED_AVAIL_CEILING       max availability failure rate for v2 (default 0.02)
 *   FLEET_PHASED_TWIN_ATTEMPTS       twin capture retries (default 3)
 *   CELLD_TTL_MS                     passed through to celld (default stock 10000)
 *   CELLD_BUCKET / S3_ENDPOINT / AWS_* or CLAWQL_SYNC_* + CLAWQL_R2_ACCOUNT_ID
 *   STREAMS_CELLD_FLEET_REQUIRED=1 to fail closed without bucket
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, openSync, unlinkSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compareDigestStepState } from "../../../docs/examples/streams-celld/src/program-cell-step-state.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../..");
const STREAMS = join(REPO, "docs/examples/streams-celld");
const ALL_PHASES = [
  "before_intent",
  "after_intent_before_call",
  "during_call",
  "after_call_before_journal",
];
/** Restrict phases (comma list). Focused H2 board: `during_call` only. */
const PHASES = (process.env.FLEET_PHASED_PHASES || ALL_PHASES.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter((s) => ALL_PHASES.includes(s));
if (PHASES.length === 0) {
  console.error("fleet-phased: FLEET_PHASED_PHASES empty or invalid");
  process.exit(1);
}

function autoWireR2() {
  if (process.env.CELLD_BUCKET) return;
  // Prefer CLAWQL_R2_*; fall back to Cloudflare account + sync/access keys
  // injected in cloud-agent / operator environments.
  const account =
    process.env.CLAWQL_R2_ACCOUNT_ID ||
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    process.env.CF_ACCOUNT_ID;
  const key = process.env.CLAWQL_SYNC_ACCESS_KEY_ID || process.env.CLOUDFLARE_ACCESS_KEY_ID;
  const secret =
    process.env.CLAWQL_SYNC_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_SECRET_ACCESS_KEY;
  if (!account || !key || !secret) return;
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  process.env.CELLD_BUCKET = `s3://clawql-streams-state/tier-c-phased-${stamp}`;
  process.env.S3_ENDPOINT =
    process.env.S3_ENDPOINT || `https://${account}.r2.cloudflarestorage.com`;
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || key;
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || secret;
  process.env.AWS_REGION = process.env.AWS_REGION || "auto";
  process.env.AWS_EC2_METADATA_DISABLED = "true";
  console.log("fleet-phased: auto-wired R2 (bucket redacted in evidence)");
}

autoWireR2();

const N = Math.max(1, Math.min(100_000, Number(process.env.FLEET_PHASED_N || 100)));
const OUT =
  process.env.FLEET_PHASED_EVIDENCE ||
  join(REPO, "docs/benchmarks/program-cell-fleet-kill/phased-evidence.json");
const PORT_A = Number(process.env.PROGRAM_CELL_FLEET_PORT_A || 9881);
const PORT_B = Number(process.env.PROGRAM_CELL_FLEET_PORT_B || 9882);
const INTERNAL_A = Number(process.env.PROGRAM_CELL_FLEET_INTERNAL_A || 9883);
const INTERNAL_B = Number(process.env.PROGRAM_CELL_FLEET_INTERNAL_B || 9884);
const PETS_PORT = Number(process.env.MOCK_PETS_PORT || 9885);
const REGION = process.env.AWS_REGION || "auto";
const RESUME_DEADLINE_MS = Math.max(
  5_000,
  Number(process.env.FLEET_PHASED_RESUME_DEADLINE_MS || 60_000)
);
/** Stock celld default is 10000; record whatever we pass through. */
const CELLD_TTL_MS = Math.max(1_000, Number(process.env.CELLD_TTL_MS || 10_000));
process.env.CELLD_TTL_MS = String(CELLD_TTL_MS);
/**
 * When set, during_call trials hang `/.well-known/celld/health` via
 * CELLD_WEDGE_HEALTH_FLAG for ~2× lease TTL before SIGKILL — exercises the
 * stale-incarnation path (ownership may move while the victim still runs).
 */
const WEDGE_HEALTH = process.env.FLEET_PHASED_WEDGE_HEALTH === "1";
const WEDGE_HOLD_MS = Math.max(
  CELLD_TTL_MS * 2,
  Number(process.env.FLEET_PHASED_WEDGE_HOLD_MS || CELLD_TTL_MS * 2)
);
/**
 * Negative-control escape hatch: allow CELLD_OUTPUT_GATE=0 and/or
 * CELLD_FENCED_ACK=0 so the same wedged board can prove the bug still fires
 * on an unfenced binary before a clean clawql.2 result means anything.
 * Default remains force-on for durability boards.
 */
const ALLOW_UNFENCED = process.env.FLEET_PHASED_ALLOW_UNFENCED === "1";
if (process.env.CELLD_OUTPUT_GATE === "0" && !ALLOW_UNFENCED) {
  console.warn(
    "fleet-phased: refusing CELLD_OUTPUT_GATE=0 — durability boards require the gate; forcing =1 (set FLEET_PHASED_ALLOW_UNFENCED=1 for negative control)"
  );
  process.env.CELLD_OUTPUT_GATE = "1";
} else if (process.env.CELLD_OUTPUT_GATE !== "0") {
  process.env.CELLD_OUTPUT_GATE = "1";
}
if (process.env.CELLD_FENCED_ACK === "0") {
  if (!ALLOW_UNFENCED && process.env.CELLD_OUTPUT_GATE !== "0") {
    console.warn(
      "fleet-phased: CELLD_FENCED_ACK=0 without ALLOW_UNFENCED — keeping =0 only if you meant it; prefer FLEET_PHASED_ALLOW_UNFENCED=1"
    );
  } else {
    console.warn(
      "fleet-phased: CELLD_FENCED_ACK=0 — H1/H2 fence disabled (negative control)"
    );
  }
} else {
  process.env.CELLD_FENCED_ACK = "1";
}
const OUTPUT_GATE_ON = process.env.CELLD_OUTPUT_GATE !== "0";
const FENCED_ACK_ON = process.env.CELLD_FENCED_ACK !== "0";
const FENCE_MODE =
  process.env.FLEET_PHASED_FENCE_MODE ||
  (OUTPUT_GATE_ON && FENCED_ACK_ON
    ? "fenced"
    : "unfenced_negative_control");
function detectCelldVersion() {
  if (process.env.FLEET_PHASED_CELLD_VERSION) {
    return process.env.FLEET_PHASED_CELLD_VERSION;
  }
  try {
    const out = execFileSync("celld", ["--version"], {
      encoding: "utf8",
      timeout: 5_000,
    }).trim();
    const m = out.match(/(\d+\.\d+\.\d+(?:-clawql\.\d+)?)/);
    return m ? m[1] : out.slice(0, 80);
  } catch {
    return "unknown";
  }
}
const CELLD_BINARY_VERSION = detectCelldVersion();
console.log(
  `fleet-phased: celld ${CELLD_BINARY_VERSION} fenceMode=${FENCE_MODE} gate=${OUTPUT_GATE_ON ? 1 : 0} fencedAck=${FENCED_ACK_ON ? 1 : 0} wedge=${WEDGE_HEALTH ? 1 : 0}`
);
const AWAIT_TRIALS = Math.max(
  0,
  Math.min(10_000, Number(process.env.FLEET_PHASED_AWAIT_TRIALS || 0))
);
const STATE_BASELINE =
  process.env.FLEET_PHASED_STATE_BASELINE === undefined
    ? true
    : process.env.FLEET_PHASED_STATE_BASELINE !== "0";
/** @type {"legacy_zero_deadline" | "correctness_availability_v2"} */
const SCORE_MODE =
  process.env.FLEET_PHASED_SCORE_MODE === "correctness_availability_v2"
    ? "correctness_availability_v2"
    : "legacy_zero_deadline";
const AVAIL_CEILING = Math.min(
  1,
  Math.max(0, Number(process.env.FLEET_PHASED_AVAIL_CEILING || 0.02))
);

if (!process.env.CELLD_BUCKET) {
  if (process.env.STREAMS_CELLD_FLEET_REQUIRED === "1") {
    console.error("fleet-phased: CELLD_BUCKET required");
    process.exit(1);
  }
  console.log("fleet-phased: SKIP — no bucket");
  process.exit(0);
}

const endpointArgs = process.env.S3_ENDPOINT ? ["--endpoint", process.env.S3_ENDPOINT] : [];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, init = {}, timeoutMs = 15_000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 200) };
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    const msg = err?.name === "AbortError" ? `timeout ${timeoutMs}ms` : String(err?.message || err);
    return { ok: false, status: 0, body: { error: msg }, fetchError: true };
  } finally {
    clearTimeout(timer);
  }
}

function spawnLogged(cmd, args, logPath, env = process.env) {
  mkdirSync(dirname(logPath), { recursive: true });
  const fd = openSync(logPath, "w");
  return spawn(cmd, args, {
    cwd: STREAMS,
    env,
    stdio: ["ignore", fd, fd],
  });
}

/**
 * Poll until pred(fetchJson) is true.
 *
 * Important: attempt count alone is not a wall budget. With per-try timeoutMs=5000,
 * the old defaults (health 240 tries / program 180 tries) could burn
 * 240×5s=1200s or **180×5s=900s** when /health accepts TCP but never responds —
 * matching the ~875–909s resume tails on v1/v2 with recoveryMs=0. Cap wallMs.
 *
 * @param {string} url
 * @param {(r: any) => boolean} pred
 * @param {{ attempts?: number, delayMs?: number, timeoutMs?: number, wallMs?: number, deadlineAt?: number }} [opts]
 */
async function waitUrl(url, pred, opts = {}) {
  const attempts = opts.attempts ?? 120;
  const delayMs = opts.delayMs ?? 250;
  const timeoutMs = opts.timeoutMs ?? 1_500;
  const wallMs = opts.wallMs ?? 45_000;
  const deadlineAt = opts.deadlineAt ?? Number.POSITIVE_INFINITY;
  const started = Date.now();
  for (let i = 0; i < attempts; i++) {
    if (Date.now() >= deadlineAt) {
      throw new Error(`deadline waiting for ${url}`);
    }
    if (Date.now() - started >= wallMs) {
      throw new Error(`wall timeout ${wallMs}ms waiting for ${url}`);
    }
    try {
      const r = await fetchJson(url, {}, timeoutMs);
      if (pred(r)) return r;
    } catch {
      /* retry */
    }
    await sleep(delayMs);
  }
  throw new Error(`timeout waiting for ${url}`);
}

/** True when nothing accepts TCP on host:port (used after SIGKILL / self-fence). */
async function waitPortFree(port, attempts = 40, delayMs = 100) {
  for (let i = 0; i < attempts; i++) {
    const free = await new Promise((resolve) => {
      const s = createServer();
      s.once("error", () => resolve(false));
      s.listen(port, "127.0.0.1", () => {
        s.close(() => resolve(true));
      });
    });
    if (free) return;
    await sleep(delayMs);
  }
}

/**
 * Diagnostic split: wall resume includes orchestrator recovery; active is the
 * non-recovery portion. Availability scoring uses wall clock only — a 15-minute
 * stall is a miss from the user's point of view regardless of what the harness
 * was doing. resumeActiveMs / recoveryMs are reported without a pass/fail ceiling.
 */
function resumeActiveMsFrom(wallMs, recoveryMs = 0) {
  return Math.max(0, wallMs - Math.max(0, recoveryMs));
}

function withinResumeDeadline(resumeStart) {
  return Date.now() - resumeStart < RESUME_DEADLINE_MS;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function stockCalls(programId) {
  return [
    { operationId: "listPets", method: "GET", path: "/pets", risk: "read" },
    { operationId: "streams.session.noop", risk: "read" },
    {
      operationId: "owners.create",
      method: "POST",
      path: "/owners",
      risk: "write",
      args: { name: programId, idempotencyKey: programId },
    },
  ];
}

function phasePlan(phase, programId) {
  const writeIdx = 2;
  const calls = stockCalls(programId);
  const body = { programId, plan: { calls } };
  if (phase === "before_intent") body.pauseBeforeIndex = writeIdx;
  else if (phase === "after_intent_before_call") body.pauseAfterIntentIndex = writeIdx;
  else if (phase === "during_call") {
    body.pauseDuringCallIndex = writeIdx;
    calls[2].args.hangMs = 30_000;
  } else if (phase === "after_call_before_journal") {
    body.pauseAfterUpstreamBeforeJournalIndex = writeIdx;
  }
  return body;
}

/** No-crash baseline plan (same calls as stock; no pause* flags). */
function baselinePlan(programId) {
  return { programId, plan: { calls: stockCalls(programId) } };
}

function awaitPlan(programId, executionId) {
  return {
    programId,
    plan: {
      calls: [{ tool: "await_approval", executionId }, ...stockCalls(programId)],
    },
  };
}

function pickPhase(i) {
  const targeted = Math.ceil(N * 0.8);
  if (i < targeted) return PHASES[i % PHASES.length];
  return PHASES[Math.floor(Math.random() * PHASES.length)];
}

function emptyPhaseStats() {
  return Object.fromEntries(
    PHASES.map((p) => [
      p,
      {
        n: 0,
        ok: 0,
        duplicates: 0,
        outcomeUnknown: 0,
        completedClean: 0,
        writeStepsRerun: 0,
        journalDivergence: 0,
        replayedSteps: 0,
        survivorSelfFences: 0,
        survivorRestarts: 0,
        resumeDeadlineMisses: 0,
        resumeMs: [],
        recoveryMs: [],
        failures: 0,
      },
    ])
  );
}

/** Scrape celld logs for lease renew RTTs (availability forensics). */
function scrapeLeaseRenewals(logPaths) {
  const elapsed = [];
  const headroom = [];
  const fenceAt = [];
  const reCompleted =
    /node_lease_attempt completed[^\n]*attempt="renew"[^\n]*elapsed_ms=(\d+)[^\n]*prior_authority_headroom_ms=(\d+)/g;
  const reFence = /SELF-FENCE[^\n]*|node_lease_watchdog_fence/g;
  for (const p of logPaths) {
    if (!existsSync(p)) continue;
    let text;
    try {
      text = readFileSync(p, "utf8");
    } catch {
      continue;
    }
    for (const m of text.matchAll(reCompleted)) {
      elapsed.push(Number(m[1]));
      headroom.push(Number(m[2]));
    }
    for (const m of text.matchAll(reFence)) {
      fenceAt.push(m[0].slice(0, 120));
    }
  }
  elapsed.sort((a, b) => a - b);
  headroom.sort((a, b) => a - b);
  return {
    celldTtlMs: CELLD_TTL_MS,
    renewSamples: elapsed.length,
    renewElapsedMs: {
      p50: percentile(elapsed, 50),
      p95: percentile(elapsed, 95),
      p99: percentile(elapsed, 99),
      max: elapsed.length ? elapsed[elapsed.length - 1] : null,
    },
    renewPriorHeadroomMs: {
      p50: percentile(headroom, 50),
      min: headroom.length ? headroom[0] : null,
    },
    selfFenceLogHits: fenceAt.length,
    note: "Renewals should complete with headroom ≫ R2 RTT. Stock CELLD_TTL_MS=10000 renews near ~6665ms headroom; slow renew cycles under peer-down storms can fence. See AVAILABILITY.md.",
  };
}

async function main() {
  const petsLog = "/tmp/fleet-phased-pets.log";
  // Fail closed if a stale mock still owns the port (old Date.now() ids break
  // digest-equal statePreserved). Free the port, then require a healthy start.
  try {
    const { execFileSync } = await import("node:child_process");
    execFileSync("bash", ["-lc", `fuser -k ${PETS_PORT}/tcp 2>/dev/null || true`], {
      stdio: "ignore",
    });
  } catch {
    /* best-effort */
  }
  await sleep(300);
  const pets = spawnLogged(
    process.execPath,
    [join(STREAMS, "scripts/mock-pets-upstream.mjs"), String(PETS_PORT)],
    petsLog
  );
  pets.on("exit", (code, signal) => {
    if (code && code !== 0) {
      console.error(`fleet-phased: mock-pets exited early code=${code} signal=${signal}`);
    }
  });
  await waitUrl(
    `http://127.0.0.1:${PETS_PORT}/healthz`,
    (r) => r.ok === true || r.body?.ok === true,
    { attempts: 40, delayMs: 100, timeoutMs: 1_500, wallMs: 10_000 }
  );
  // Probe deterministic owner id (claim-path digest equality depends on this).
  const probe = await fetchJson(`http://127.0.0.1:${PETS_PORT}/owners`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "fleet_probe_key",
    },
    body: JSON.stringify({ name: "probe", idempotencyKey: "fleet_probe_key" }),
  });
  if (probe.body?.id !== "owner_fleet_probe_key") {
    throw new Error(
      `mock-pets not serving deterministic owner ids (got ${JSON.stringify(probe.body)}); refuse to measure statePreserved`
    );
  }
  await fetchJson(`http://127.0.0.1:${PETS_PORT}/__reset`, { method: "POST" });

  const cfg = join(STREAMS, "wrangler.program-cell-fleet-phased.jsonc");
  const src = readFileSync(join(STREAMS, "wrangler.jsonc"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const wrangler = JSON.parse(src);
  wrangler.vars = wrangler.vars || {};
  wrangler.vars.CLAWQL_CORE_UPSTREAM = `http://127.0.0.1:${PETS_PORT}`;
  wrangler.vars.CLAWQL_MCP_URL = "";
  wrangler.vars.INFERENCE_URL = "";
  writeFileSync(cfg, JSON.stringify(wrangler, null, 2) + "\n");

  const deploy = spawn(
    "celld",
    ["deploy", cfg, "--bucket", process.env.CELLD_BUCKET, "--region", REGION, ...endpointArgs],
    { cwd: STREAMS, env: process.env, stdio: "inherit" }
  );
  await new Promise((resolve, reject) => {
    deploy.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`deploy ${code}`))));
  });

  const nodes = {
    A: {
      port: PORT_A,
      internal: INTERNAL_A,
      pid: null,
      log: "/tmp/fleet-phased-a.log",
      lastExit: null,
      pendingSelfFence: false,
      wedgeFlag: "/tmp/fleet-phased-wedge-A.flag",
    },
    B: {
      port: PORT_B,
      internal: INTERNAL_B,
      pid: null,
      log: "/tmp/fleet-phased-b.log",
      lastExit: null,
      pendingSelfFence: false,
      wedgeFlag: "/tmp/fleet-phased-wedge-B.flag",
    },
  };

  async function startNode(name) {
    const n = nodes[name];
    if (n.pid) {
      try {
        process.kill(n.pid, "SIGKILL");
      } catch {
        /* */
      }
      n.pid = null;
    }
    // Clear any leftover wedge flag so a restarted node answers health.
    try {
      unlinkSync(n.wedgeFlag);
    } catch {
      /* */
    }
    // After SELF-FENCE / SIGKILL the old listener can hold the port briefly;
    // binding into a half-dead socket is a common /health timeout cause.
    await waitPortFree(n.port);
    await waitPortFree(n.internal);
    // Fresh node-session id per start so a fenced identity cannot renew against
    // the same CELLD_NODE after orchestrator restart (lease-sweep is upstream).
    const nodeEnv = {
      ...process.env,
      CELLD_OUTPUT_GATE: OUTPUT_GATE_ON ? "1" : "0",
      CELLD_FENCED_ACK: FENCED_ACK_ON ? "1" : "0",
      CELLD_WEDGE_HEALTH_FLAG: n.wedgeFlag,
      // Durable-ack latency (wait_us on durable_wait); set RUST_LOG=timing=debug
      // on the board env to populate node logs for PUT vs PUT+GET A/B.
      RUST_LOG: process.env.RUST_LOG || process.env.CELLD_RUST_LOG || "",
      CELLD_NODE: `fleet_${name}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    };
    if (!nodeEnv.RUST_LOG) delete nodeEnv.RUST_LOG;
    const child = spawnLogged(
      "celld",
      [
        "--bucket",
        process.env.CELLD_BUCKET,
        "--region",
        REGION,
        ...endpointArgs,
        "--listen",
        `127.0.0.1:${n.port}`,
        "--internal-listen",
        `127.0.0.1:${n.internal}`,
        "--advertise",
        `127.0.0.1:${n.internal}`,
      ],
      n.log,
      nodeEnv
    );
    n.pid = child.pid;
    child.on("exit", (code, signal) => {
      if (n.pid === child.pid) n.pid = null;
      const selfFence = code === 3;
      n.lastExit = {
        code,
        signal,
        at: new Date().toISOString(),
        selfFence,
      };
      if (selfFence) n.pendingSelfFence = true;
      if (signal !== "SIGKILL") {
        console.warn(
          `fleet-phased: node ${name} exited code=${code} signal=${signal}${selfFence ? " SELF-FENCE" : ""}`
        );
      }
    });
    return child;
  }

  /**
   * @param {string} name
   * @param {{ requireProgram?: boolean, programAttempts?: number, cell?: string, wallMs?: number, deadlineAt?: number, timeoutMs?: number }} [opts]
   */
  async function waitNode(name, opts = {}) {
    const requireProgram = opts.requireProgram !== false;
    // Wall budgets (not attempt×timeout): hung /health burning 5s/try turned the old
    // "180 attempts ≈ 45s" comment into a silent **~900s** stall (v1/v2 resume max).
    const programWallMs = opts.wallMs ?? 45_000;
    const healthWallMs = Math.min(30_000, programWallMs);
    const programAttempts = opts.programAttempts ?? 180;
    // Probe a dedicated cell — never the trial DO — so readiness does not fight
    // ownership of the program under test (worker defaults cell=default otherwise).
    const cell = opts.cell || "health";
    const base = `http://127.0.0.1:${nodes[name].port}`;
    const poll = {
      delayMs: 250,
      timeoutMs: opts.timeoutMs ?? 1_500,
      deadlineAt: opts.deadlineAt,
    };
    await waitUrl(`${base}/health`, (r) => r.ok, {
      ...poll,
      attempts: 240,
      wallMs: healthWallMs,
    });
    if (!requireProgram) return;
    await waitUrl(
      `${base}/program/health?cell=${encodeURIComponent(cell)}`,
      (r) => r.ok && /ProgramCellDO/.test(JSON.stringify(r.body)),
      {
        ...poll,
        attempts: programAttempts,
        wallMs: programWallMs,
      }
    );
  }

  async function restartNode(name, opts = {}) {
    await startNode(name);
    try {
      await waitNode(name, {
        requireProgram: true,
        programAttempts: 80,
        deadlineAt: opts.deadlineAt,
      });
    } catch (err) {
      console.warn(`fleet-phased: waitNode(${name}) failed (${err.message}); retry once`);
      await startNode(name);
      await sleep(1500);
      await waitNode(name, {
        requireProgram: true,
        programAttempts: 120,
        deadlineAt: opts.deadlineAt,
      });
    }
  }

  async function rebuildFleet() {
    console.warn("fleet-phased: rebuilding both nodes after ownership/ready stall");
    await startNode("A");
    await startNode("B");
    await sleep(2000);
    // Bound each wait — an unbounded ready_gate stall previously hung the N=1000 lab
    // after a survivor SELF-FENCE. Prefer a shorter dual restart over never finishing.
    try {
      await waitNode("A", { requireProgram: true, programAttempts: 120 });
      await waitNode("B", { requireProgram: true, programAttempts: 120 });
    } catch (err) {
      console.warn(`fleet-phased: rebuildFleet wait failed (${err.message}); hard restart once`);
      await startNode("A");
      await startNode("B");
      await sleep(3000);
      await waitNode("A", { requireProgram: true, programAttempts: 120 });
      await waitNode("B", { requireProgram: true, programAttempts: 120 });
    }
  }

  /**
   * Ensure survivor is alive for resume. Counts self-fence / restart; time spent
   * here goes to recoveryMs and also to wall resumeMs / the resume deadline —
   * orchestrator recovery is not excluded from "no outcome in time".
   * @param {string} name
   * @param {any} counters
   * @param {{ deadlineAt?: number }} [opts] — when set (resume path), waitNode/restart
   *   must not outrun the wall resume deadline (the ~900s hang was waitNode ignoring it).
   */
  async function ensureSurvivor(name, counters, opts = {}) {
    const n = nodes[name];
    const waitOpts = opts.deadlineAt != null ? { deadlineAt: opts.deadlineAt } : {};
    if (n.pendingSelfFence) {
      counters.survivorSelfFence = true;
      n.pendingSelfFence = false;
    }
    if (!n.pid) {
      if (n.lastExit?.selfFence) counters.survivorSelfFence = true;
      counters.survivorRestart = true;
      const t0 = Date.now();
      try {
        await restartNode(name, waitOpts);
      } catch (err) {
        console.warn(
          `fleet-phased: ensureSurvivor(${name}) restart failed (${err.message}); rebuildFleet`
        );
        try {
          await rebuildFleet();
        } catch (rebuildErr) {
          console.warn(`fleet-phased: ensureSurvivor rebuildFleet failed (${rebuildErr.message})`);
        }
      }
      counters.recoveryMs += Date.now() - t0;
      return;
    }
    const tWait = Date.now();
    try {
      await waitNode(name, waitOpts);
      counters.recoveryMs += Date.now() - tWait;
    } catch {
      counters.recoveryMs += Date.now() - tWait;
      if (n.lastExit?.selfFence || n.pendingSelfFence) counters.survivorSelfFence = true;
      n.pendingSelfFence = false;
      counters.survivorRestart = true;
      const t0 = Date.now();
      try {
        await restartNode(name, waitOpts);
      } catch (err) {
        console.warn(
          `fleet-phased: ensureSurvivor(${name}) restart failed (${err.message}); rebuildFleet`
        );
        try {
          await rebuildFleet();
        } catch (rebuildErr) {
          console.warn(`fleet-phased: ensureSurvivor rebuildFleet failed (${rebuildErr.message})`);
        }
      }
      counters.recoveryMs += Date.now() - t0;
    }
  }

  // Start both nodes before waiting — a solo node with fleet durability may
  // never open ready_gate /program/health until a peer exists.
  await startNode("A");
  await startNode("B");
  await sleep(2000);
  await waitNode("A", { requireProgram: true, programAttempts: 180 });
  await waitNode("B", { requireProgram: true, programAttempts: 180 });
  console.log("fleet-phased: both nodes /health + /program/health ready");

  const phaseStats = emptyPhaseStats();
  const trials = [];
  const awaitTrials = [];
  let totalDuplicates = 0;
  let totalSelfFences = 0;
  let totalSurvivorRestarts = 0;
  let totalDeadlineMisses = 0;
  let stateEligible = 0;
  let statePreserved = 0;
  let stateTwinFailures = 0;
  let primary = "A";
  const boardStarted = Date.now();
  // Trials use the worker default DO (program:default) — same as the proven
  // smoke + N=8 PASS. After SIGKILL, wait for survivor /program/health before
  // resume (ownership transfer); that wait is inside resumeMs.
  // statePreserved uses a per-outer-trial no-crash twin with the same plan args
  // (exact digest equality), not a once-per-board structural baseline.

  const cleanup = () => {
    for (const n of Object.values(nodes)) {
      if (n.pid)
        try {
          process.kill(n.pid, "SIGKILL");
        } catch {
          /* */
        }
    }
    try {
      process.kill(pets.pid, "SIGKILL");
    } catch {
      /* */
    }
    try {
      unlinkSync(cfg);
    } catch {
      /* */
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });

  for (let i = 0; i < N; i++) {
    const phase = pickPhase(i);
    const victim = primary;
    const survivor = primary === "A" ? "B" : "A";
    const programId = `phased_${phase}_${i}_${Date.now()}`;
    const baseV = `http://127.0.0.1:${nodes[victim].port}`;
    const baseS = `http://127.0.0.1:${nodes[survivor].port}`;

    // Clear stale fence flags from prior intentional victim kills.
    nodes[victim].pendingSelfFence = false;
    if (nodes[victim].lastExit?.signal === "SIGKILL") {
      /* intentional — not a self-fence */
    }

    await fetchJson(`http://127.0.0.1:${PETS_PORT}/__reset`, { method: "POST" });
    const writesBefore =
      (await fetchJson(`http://127.0.0.1:${PETS_PORT}/__writes`)).body?.count || 0;

    const body = phasePlan(phase, programId);
    let runRes;

    if (phase === "during_call") {
      const ac = new AbortController();
      const runPromise = fetch(`${baseV}/program/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
      }).catch(() => null);
      for (let w = 0; w < 40; w++) {
        const ledger = await fetchJson(`http://127.0.0.1:${PETS_PORT}/__writes`);
        if ((ledger.body?.inFlight || 0) > 0) break;
        await sleep(100);
      }
      await sleep(200);
      // Hang node health so peers see a wedged member; hold ~2× TTL so the
      // lease can move while the victim still runs the mid-flight call.
      if (WEDGE_HEALTH) {
        writeFileSync(nodes[victim].wedgeFlag, `wedge ${Date.now()}\n`);
        await sleep(WEDGE_HOLD_MS);
      }
      if (nodes[victim].pid) {
        process.kill(nodes[victim].pid, "SIGKILL");
        nodes[victim].pid = null;
      }
      try {
        unlinkSync(nodes[victim].wedgeFlag);
      } catch {
        /* */
      }
      ac.abort();
      await runPromise;
      for (let w = 0; w < 30; w++) {
        const ledger = await fetchJson(`http://127.0.0.1:${PETS_PORT}/__writes`);
        if ((ledger.body?.inFlight || 0) === 0) break;
        await sleep(100);
      }
      runRes = {
        body: {
          status: "paused_for_kill",
          pauseKind: "during_call",
          wedgedHealth: WEDGE_HEALTH,
        },
      };
    } else {
      runRes = await fetchJson(`${baseV}/program/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (runRes.body?.status !== "paused_for_kill") {
        phaseStats[phase].failures += 1;
        phaseStats[phase].n += 1;
        trials.push({
          i,
          phase,
          ok: false,
          pauseFailed: true,
          failureClass: "availability",
          failureReason: "pause_failed",
          detail: `pause failed: ${JSON.stringify(runRes.body).slice(0, 120)}`,
        });
        if (!nodes[victim].pid) await restartNode(victim);
        continue;
      }
      if (nodes[victim].pid) {
        process.kill(nodes[victim].pid, "SIGKILL");
        nodes[victim].pid = null;
      }
    }

    const avail = {
      survivorSelfFence: false,
      survivorRestart: false,
      recoveryMs: 0,
      resumeDeadlineMiss: false,
    };

    const postKillMs = Math.max(0, Number(process.env.FLEET_PHASED_POST_KILL_MS || 600));
    await sleep(postKillMs);

    // Wall resume clock = ownership transfer + survivor restart/rebuild + resume HTTP.
    // Deadline uses the same wall clock (recovery inclusive). A multi-minute
    // orchestrator stall is an availability miss from the user's point of view.
    const resumeStart = Date.now();
    const resumeDeadlineAt = resumeStart + RESUME_DEADLINE_MS;
    if (!nodes[survivor].pid || nodes[survivor].pendingSelfFence) {
      await ensureSurvivor(survivor, avail, { deadlineAt: resumeDeadlineAt });
    }

    // Smoke parity: wait until survivor can route ProgramCellDO before resume.
    while (withinResumeDeadline(resumeStart)) {
      if (!nodes[survivor].pid || nodes[survivor].pendingSelfFence) {
        await ensureSurvivor(survivor, avail, { deadlineAt: resumeDeadlineAt });
      }
      const ph = await fetchJson(`${baseS}/program/health`, {}, 1_500);
      if (ph.ok && /ProgramCellDO/.test(JSON.stringify(ph.body))) break;
      await sleep(250);
    }

    // Mid-flight kills journal intent before the hang. A resume 404 can mean "not
    // visible yet" (availability) or "meta gone" (correctness). Never treat the
    // first 404 as terminal for mid-flight — keep waiting until the wall deadline.
    const midFlight =
      phase === "after_intent_before_call" || phase === "during_call";
    let resume = { ok: false, status: 0, body: null, fetchError: true };
    while (withinResumeDeadline(resumeStart)) {
      if (!nodes[survivor].pid || nodes[survivor].pendingSelfFence) {
        await ensureSurvivor(survivor, avail, { deadlineAt: resumeDeadlineAt });
      }
      resume = await fetchJson(
        `${baseS}/program/resume`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ programId }),
        },
        20_000
      );
      if (resume.fetchError) {
        await sleep(200);
        continue;
      }
      // 500 DurableObjectRoutingError → keep waiting for ownership
      if (resume.status === 500 && /unreachable|ResolveFailed/i.test(JSON.stringify(resume.body))) {
        await sleep(250);
        continue;
      }
      if (midFlight && resume.status === 404 && resume.body?.error === "not_found") {
        await sleep(250);
        continue;
      }
      if (resume.ok || resume.status === 404 || (resume.status && resume.status !== 0)) break;
      await sleep(100);
    }
    if (!(
      resume.ok ||
      (!midFlight && resume.status === 404 && resume.body?.error === "not_found") ||
      (resume.status && resume.status !== 500 && resume.status !== 404 && !resume.fetchError)
    )) {
      // Deadline miss if we never got a definitive program response in wall time.
      // Mid-flight 404-through-deadline is also a miss (visibility), not a clean not_found.
      if (
        !resume.ok &&
        (resume.fetchError ||
          resume.status === 500 ||
          resume.status === 0 ||
          (midFlight && resume.status === 404))
      ) {
        avail.resumeDeadlineMiss = true;
      }
    }
    const resumeMs = Date.now() - resumeStart;
    const resumeActiveMs = resumeActiveMsFrom(resumeMs, avail.recoveryMs);

    const ledger = await fetchJson(`http://127.0.0.1:${PETS_PORT}/__writes`);
    const writeCount = ledger.body?.count || 0;
    const duplicates = Math.max(0, writeCount - 1);
    const outcomeUnknown = Boolean(
      resume.body?.outcomeUnknown ||
      (resume.body?.calls || []).some(
        (c) => c.outcomeUnknown || c.result?.status === "outcome_unknown"
      )
    );
    const completedClean =
      resume.body?.status === "completed" && resume.body?.ok === true && !outcomeUnknown;
    const journalDivergence = Boolean(
      resume.body?.journalDivergence || resume.body?.diagnostics?.code === "journal_divergence"
    );
    const resumeCalls = Array.isArray(resume.body?.calls) ? resume.body.calls : [];
    const replayedSteps = resumeCalls.filter((c) => c.replayed === true).length;
    // Host re-execution of a call that already had a journal entry would surface as a
    // duplicate write on the pets ledger (writes) — target 0 for completed steps.
    const writeStepsRerun = duplicates;

    /** @type {null | { preserved: boolean, reason: string, attempts?: number }} */
    let statePreservedTrial = null;
    const outerPhase = phase === "before_intent" || phase === "after_call_before_journal";
    if (STATE_BASELINE && outerPhase && completedClean && resumeCalls.length) {
      stateEligible += 1;
      // Score writeCount before twin; twin resets the pets ledger.
      const twinId = `twin_${programId}`;
      // Same plan args (name + idempotencyKey = programId) as the crash trial so
      // mock owners.create returns an identical deterministic body.
      const twinBody = baselinePlan(twinId);
      twinBody.plan.calls = stockCalls(programId);
      // Twin runs on the same fleet as resume — a SELF-FENCE can kill the capture.
      // Retry a few times; classify twin_capture_failed vs digest_mismatch (both fail
      // the frozen rate gate, but they are not the same cause).
      const twinAttemptsMax = Math.max(
        1,
        Math.min(5, Number(process.env.FLEET_PHASED_TWIN_ATTEMPTS || 3))
      );
      let twinAttempt = 0;
      let twinLastErr = null;
      while (twinAttempt < twinAttemptsMax) {
        twinAttempt += 1;
        try {
          await fetchJson(`http://127.0.0.1:${PETS_PORT}/__reset`, { method: "POST" });
          if (!nodes[survivor].pid || nodes[survivor].pendingSelfFence) {
            await ensureSurvivor(survivor, avail);
          }
          const twinPort = nodes[survivor].port;
          const twinRes = await fetchJson(
            `http://127.0.0.1:${twinPort}/program/run`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(twinBody),
            },
            30_000
          );
          if (twinRes.body?.status === "completed" && Array.isArray(twinRes.body?.calls)) {
            const cmp = compareDigestStepState(
              twinRes.body.calls,
              resumeCalls,
              twinRes.body?.result,
              resume.body?.result
            );
            if (cmp.preserved) {
              statePreserved += 1;
              statePreservedTrial = {
                preserved: true,
                reason: "digest_match",
                attempts: twinAttempt,
              };
              twinLastErr = null;
              break;
            }
            statePreservedTrial = {
              preserved: false,
              reason: "digest_mismatch",
              attempts: twinAttempt,
              mismatchIndexes: cmp.mismatchIndexes,
            };
            if (process.env.FLEET_PHASED_DEBUG_STATE === "1") {
              const mi = cmp.mismatchIndexes?.[0];
              console.warn(
                "fleet-phased: statePreserved digest_mismatch",
                JSON.stringify({
                  mismatchIndexes: cmp.mismatchIndexes,
                  twinStep: cmp.baseline?.[mi],
                  resumeStep: cmp.observed?.[mi],
                }).slice(0, 2000)
              );
            }
            // Digest mismatch will not improve on retry with the same journaled resume.
            twinLastErr = null;
            break;
          }
          twinLastErr = `twin status=${twinRes.body?.status || twinRes.status}`;
        } catch (twinErr) {
          twinLastErr = twinErr instanceof Error ? twinErr.message : String(twinErr);
          console.warn(
            `fleet-phased: twin capture attempt ${twinAttempt}/${twinAttemptsMax} failed (${twinLastErr})`
          );
          // Prefer survivor ensure over full rebuild — twin rebuild storms were
          // folding multi-minute orchestrator work into availability tails.
          try {
            await ensureSurvivor(survivor, avail);
          } catch {
            try {
              await rebuildFleet();
            } catch {
              /* next attempt */
            }
          }
        }
      }
      if (statePreservedTrial == null) {
        stateTwinFailures += 1;
        statePreservedTrial = {
          preserved: false,
          reason: "twin_capture_failed",
          attempts: twinAttempt,
          detail: twinLastErr,
        };
      } else if (statePreservedTrial.preserved === false) {
        if (statePreservedTrial.reason === "twin_capture_failed") stateTwinFailures += 1;
        // digest_mismatch still fails the rate (preservedN) without counting as twinCaptureFailures
      }
    }

    let expectOk = false;
    if (!avail.resumeDeadlineMiss) {
      if (phase === "before_intent") {
        expectOk = completedClean && writeCount === 1 && duplicates === 0 && !outcomeUnknown;
      } else if (phase === "after_intent_before_call") {
        expectOk = outcomeUnknown && writeCount === 0 && duplicates === 0;
      } else if (phase === "during_call") {
        expectOk = outcomeUnknown && writeCount <= 1 && duplicates === 0;
      } else if (phase === "after_call_before_journal") {
        expectOk = completedClean && writeCount === 1 && duplicates === 0 && !outcomeUnknown;
      }
    }
    // Twin capture is part of the availability outcome for outer phases — a
    // digest match with twin_capture_failed must not look like a clean trial.ok.
    if (statePreservedTrial?.reason === "twin_capture_failed") {
      expectOk = false;
    }
    // Self-fence + successful orchestrated recovery still counts as phase-ok for safety,
    // but availability columns record the incident. Deadline miss fails the trial.

    const st = phaseStats[phase];
    st.n += 1;
    st.resumeMs.push(resumeMs);
    if (avail.recoveryMs > 0) st.recoveryMs.push(avail.recoveryMs);
    if (duplicates > 0) {
      st.duplicates += duplicates;
      totalDuplicates += duplicates;
    }
    if (outcomeUnknown) st.outcomeUnknown += 1;
    if (completedClean) st.completedClean += 1;
    if (avail.survivorSelfFence) {
      st.survivorSelfFences += 1;
      totalSelfFences += 1;
    }
    if (avail.survivorRestart) {
      st.survivorRestarts += 1;
      totalSurvivorRestarts += 1;
    }
    if (avail.resumeDeadlineMiss) {
      st.resumeDeadlineMisses += 1;
      totalDeadlineMisses += 1;
    }
    if (journalDivergence) st.journalDivergence = (st.journalDivergence || 0) + 1;
    st.writeStepsRerun = (st.writeStepsRerun || 0) + writeStepsRerun;
    st.replayedSteps = (st.replayedSteps || 0) + replayedSteps;

    // Mid-flight storage check (v3): intent or pauseKind must be visible on the
    // survivor after journal-before-hang. Missing = durability/correctness.
    // Does not use local re-get-as-proof — queries survivor /program/status.
    let midFlightStorage = null;
    if (midFlight) {
      const statusRes = await fetchJson(
        `${baseS}/program/status?programId=${encodeURIComponent(programId)}`,
        {},
        8_000
      );
      const meta = statusRes.body?.meta || null;
      const intents = Array.isArray(statusRes.body?.intents) ? statusRes.body.intents : [];
      const hasIntent = intents.length > 0;
      const pauseKind = meta?.pauseKind || null;
      const present =
        Boolean(meta) &&
        (hasIntent ||
          pauseKind === "during_call" ||
          pauseKind === "after_intent_before_call");
      midFlightStorage = {
        statusOk: Boolean(statusRes.ok && statusRes.body?.ok),
        hasMeta: Boolean(meta),
        hasIntent,
        pauseKind,
        present,
      };
      if (!present) {
        expectOk = false;
      }
    }

    if (expectOk) st.ok += 1;
    else st.failures += 1;

    // Outcome-based class (v2 gates). Correctness = wrong outcome; availability = no outcome in time.
    let failureClass = null;
    let failureReason = null;
    if (duplicates > 0 || writeStepsRerun > 0) {
      failureClass = "correctness";
      failureReason = "duplicate_or_write_rerun";
    } else if (journalDivergence) {
      failureClass = "correctness";
      failureReason = "journal_divergence";
    } else if (statePreservedTrial?.reason === "digest_mismatch") {
      failureClass = "correctness";
      failureReason = "digest_mismatch";
    } else if (midFlightStorage && midFlightStorage.present === false) {
      failureClass = "correctness";
      failureReason = "lost_midflight_intent";
    } else if (avail.resumeDeadlineMiss) {
      failureClass = "availability";
      failureReason = "resume_deadline_miss";
    } else if (statePreservedTrial?.reason === "twin_capture_failed") {
      failureClass = "availability";
      failureReason = "twin_capture_failed";
    } else if (!expectOk) {
      // Mid-flight without outcome_unknown after a timed-out / empty resume, etc.
      failureClass = "availability";
      failureReason = "no_expected_outcome";
    }

    trials.push({
      i,
      phase,
      programId,
      ok: expectOk,
      duplicates,
      writeCount,
      outcomeUnknown,
      completedClean,
      journalDivergence,
      writeStepsRerun,
      replayedSteps,
      statePreserved: statePreservedTrial,
      failureClass,
      failureReason,
      midFlightStorage,
      resumeMs,
      resumeActiveMs,
      recoveryMs: avail.recoveryMs,
      survivorSelfFence: avail.survivorSelfFence,
      survivorRestart: avail.survivorRestart,
      resumeDeadlineMiss: avail.resumeDeadlineMiss,
      writesBefore,
      resumeStatus: resume.status,
      resumeBodyStatus: resume.body?.status ?? null,
      resumeOk: resume.body?.ok ?? null,
      resumeError: resume.body?.error ?? resume.body?.raw ?? null,
    });

    // Victim only needs /health before the next flip; program routing is checked
    // on the survivor path above for the following trial.
    try {
      await startNode(victim);
      await waitNode(victim, { requireProgram: false });
    } catch (err) {
      console.warn(`fleet-phased: victim ${victim} restart failed (${err.message}); rebuild fleet`);
      try {
        await rebuildFleet();
      } catch (rebuildErr) {
        console.warn(
          `fleet-phased: rebuildFleet after victim failed (${rebuildErr.message}); continuing with survivor only next loop will rebuild`
        );
      }
    }
    primary = survivor;

    // Wedge / negative-control boards are slow and sparse — log every trial so
    // lost-intent rate is visible before the 10-trial evidence watermark.
    const progressEvery = WEDGE_HEALTH || ALLOW_UNFENCED ? 1 : 10;
    if ((i + 1) % progressEvery === 0 || i === N - 1) {
      const elapsedSec = (Date.now() - boardStarted) / 1000;
      const rate = (i + 1) / Math.max(1, elapsedSec);
      const etaMin = ((N - i - 1) / Math.max(0.01, rate) / 60).toFixed(1);
      const lostIntent = midFlightStorage && midFlightStorage.present === false ? 1 : 0;
      console.log(
        `fleet-phased: ${i + 1}/${N} dups=${totalDuplicates} fences=${totalSelfFences} restarts=${totalSurvivorRestarts} deadlineMiss=${totalDeadlineMisses} lostIntent=${lostIntent} last=${phase} ok=${expectOk} resumeMs=${resumeMs} fenceMode=${FENCE_MODE} rate=${rate.toFixed(2)}/s eta=${etaMin}m`
      );
      writeEvidencePartial();
    }
  }

  // Claim-path §4 — separate await_approval arm (does not mix into write-kill phases).
  for (let a = 0; a < AWAIT_TRIALS; a++) {
    const victim = primary;
    const survivor = primary === "A" ? "B" : "A";
    const programId = `await_${a}_${Date.now()}`;
    const executionId = `pex_await_${a}_${Date.now()}`;
    const baseV = `http://127.0.0.1:${nodes[victim].port}`;
    const baseS = `http://127.0.0.1:${nodes[survivor].port}`;
    nodes[victim].pendingSelfFence = false;

    await fetchJson(`http://127.0.0.1:${PETS_PORT}/__reset`, { method: "POST" });
    await fetchJson(`http://127.0.0.1:${PETS_PORT}/__pending`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ executionId, status: "pending" }),
    });

    const parkRes = await fetchJson(`${baseV}/program/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(awaitPlan(programId, executionId)),
    });
    const parked = parkRes.body?.status === "parked" || parkRes.body?.code === "awaiting_approval";
    if (!parked) {
      // Harness bug in v1: this path pushed ok=false with no failureClass, no console.log,
      // and only a best-effort victim restart — so a dead fleet silently burned the rest of
      // the await arm (v1: 178/180 failures were park_failed; log jumped from 74/250 to done).
      // Criteria unchanged: classify as availability, always log, rebuild before continuing.
      const parkDetail = `park failed: ${JSON.stringify(parkRes.body).slice(0, 120)}`;
      awaitTrials.push({
        a,
        ok: false,
        survived: false,
        completedAfterApprove: false,
        detail: parkDetail,
        failureClass: "availability",
        failureReason: "await_park_failed",
      });
      console.log(
        `fleet-phased: await ${a + 1}/${AWAIT_TRIALS} survived=false completed=false ok=false detail=park_failed`
      );
      try {
        // Prefer a full rebuild: a single dead/unready node is what turned v1's remaining
        // ~176 await trials into silent park_failed continues.
        await rebuildFleet();
      } catch (err) {
        console.warn(`fleet-phased: await park-fail rebuildFleet failed (${err.message})`);
        try {
          if (!nodes[victim].pid) await restartNode(victim);
        } catch (restartErr) {
          console.warn(`fleet-phased: await park-fail victim restart failed (${restartErr.message})`);
        }
      }
      if ((a + 1) % 10 === 0 || a === AWAIT_TRIALS - 1) writeEvidencePartial();
      continue;
    }

    if (nodes[victim].pid) {
      process.kill(nodes[victim].pid, "SIGKILL");
      nodes[victim].pid = null;
    }
    await sleep(Math.max(0, Number(process.env.FLEET_PHASED_POST_KILL_MS || 600)));

    const avail = {
      survivorSelfFence: false,
      survivorRestart: false,
      recoveryMs: 0,
      resumeDeadlineMiss: false,
    };
    const resumeStart = Date.now();
    const resumeDeadlineAt = resumeStart + RESUME_DEADLINE_MS;
    if (!nodes[survivor].pid || nodes[survivor].pendingSelfFence) {
      await ensureSurvivor(survivor, avail, { deadlineAt: resumeDeadlineAt });
    }
    while (withinResumeDeadline(resumeStart)) {
      if (!nodes[survivor].pid || nodes[survivor].pendingSelfFence) {
        await ensureSurvivor(survivor, avail, { deadlineAt: resumeDeadlineAt });
      }
      const ph = await fetchJson(`${baseS}/program/health`, {}, 1_500);
      if (ph.ok && /ProgramCellDO/.test(JSON.stringify(ph.body))) break;
      await sleep(250);
    }

    let mid = { ok: false, body: null };
    while (withinResumeDeadline(resumeStart)) {
      if (!nodes[survivor].pid || nodes[survivor].pendingSelfFence) {
        await ensureSurvivor(survivor, avail, { deadlineAt: resumeDeadlineAt });
      }
      mid = await fetchJson(
        `${baseS}/program/resume`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ programId }),
        },
        20_000
      );
      if (mid.fetchError || mid.status === 500) {
        await sleep(200);
        continue;
      }
      break;
    }
    const survived = mid.body?.status === "parked" || mid.body?.code === "awaiting_approval";

    await fetchJson(`http://127.0.0.1:${PETS_PORT}/__pending`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ executionId, status: "approved" }),
    });

    let done = { ok: false, body: null };
    while (withinResumeDeadline(resumeStart)) {
      if (!nodes[survivor].pid || nodes[survivor].pendingSelfFence) {
        await ensureSurvivor(survivor, avail, { deadlineAt: resumeDeadlineAt });
      }
      done = await fetchJson(
        `${baseS}/program/resume`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ programId }),
        },
        20_000
      );
      if (done.fetchError || done.status === 500) {
        await sleep(200);
        continue;
      }
      break;
    }
    const ledger = await fetchJson(`http://127.0.0.1:${PETS_PORT}/__writes`);
    const writeCount = ledger.body?.count || 0;
    const completedAfterApprove =
      done.body?.status === "completed" && done.body?.ok === true && writeCount === 1;
    const ok = survived && completedAfterApprove && writeCount === 1;
    let awaitFailureClass = null;
    let awaitFailureReason = null;
    if (writeCount > 1) {
      awaitFailureClass = "correctness";
      awaitFailureReason = "duplicate_write";
    } else if (!ok) {
      awaitFailureClass = "availability";
      awaitFailureReason = !survived
        ? "await_not_survived"
        : "await_not_completed_in_time";
    }
    const awaitResumeMs = Date.now() - resumeStart;
    awaitTrials.push({
      a,
      ok,
      survived,
      completedAfterApprove,
      writeCount,
      failureClass: awaitFailureClass,
      failureReason: awaitFailureReason,
      resumeDeadlineMiss: avail.resumeDeadlineMiss,
      resumeMs: awaitResumeMs,
      resumeActiveMs: resumeActiveMsFrom(awaitResumeMs, avail.recoveryMs),
      recoveryMs: avail.recoveryMs,
    });

    try {
      await startNode(victim);
      await waitNode(victim, { requireProgram: false });
    } catch (err) {
      console.warn(`fleet-phased: await victim restart failed (${err.message}); rebuild`);
      try {
        await rebuildFleet();
      } catch (rebuildErr) {
        console.warn(`fleet-phased: await rebuildFleet failed (${rebuildErr.message})`);
      }
    }
    primary = survivor;
    console.log(
      `fleet-phased: await ${a + 1}/${AWAIT_TRIALS} survived=${survived} completed=${completedAfterApprove} ok=${ok}`
    );
    if ((a + 1) % 10 === 0 || a === AWAIT_TRIALS - 1) writeEvidencePartial();
  }

  function summarize() {
    const allResume = trials
      .filter((t) => t.resumeMs != null)
      .map((t) => t.resumeMs)
      .sort((a, b) => a - b);
    const allRecovery = [
      ...trials.filter((t) => t.recoveryMs > 0).map((t) => t.recoveryMs),
      ...awaitTrials.filter((t) => t.recoveryMs > 0).map((t) => t.recoveryMs),
    ].sort((a, b) => a - b);
    const byPhase = {};
    for (const p of PHASES) {
      const s = phaseStats[p];
      const ms = [...s.resumeMs].sort((a, b) => a - b);
      const rec = [...s.recoveryMs].sort((a, b) => a - b);
      byPhase[p] = {
        n: s.n,
        ok: s.ok,
        failures: s.failures,
        duplicates: s.duplicates,
        outcomeUnknown: s.outcomeUnknown,
        outcomeUnknownRate: s.n ? s.outcomeUnknown / s.n : 0,
        completedClean: s.completedClean,
        completedCleanRate: s.n ? s.completedClean / s.n : 0,
        writeStepsRerun: s.writeStepsRerun || 0,
        journalDivergence: s.journalDivergence || 0,
        survivorSelfFences: s.survivorSelfFences,
        survivorSelfFenceRate: s.n ? s.survivorSelfFences / s.n : 0,
        survivorRestarts: s.survivorRestarts,
        resumeDeadlineMisses: s.resumeDeadlineMisses,
        resumeMs: {
          p50: percentile(ms, 50),
          p95: percentile(ms, 95),
          p99: percentile(ms, 99),
          p999: percentile(ms, 99.9),
        },
        recoveryMs: {
          n: rec.length,
          p50: percentile(rec, 50),
          p95: percentile(rec, 95),
          p99: percentile(rec, 99),
        },
      };
    }
    const zeroDup = totalDuplicates === 0;
    const upper95 = zeroDup && N > 0 ? 3 / N : null;
    const lease = scrapeLeaseRenewals([nodes.A.log, nodes.B.log]);
    const allPhaseOk = trials.length > 0 && trials.every((t) => t.ok === true);
    const totalCompletedClean = trials.filter((t) => t.completedClean).length;
    // Outer phases must complete cleanly; mid-flight phases intentionally end outcome_unknown.
    const completionEligible = trials.filter(
      (t) => t.phase === "before_intent" || t.phase === "after_call_before_journal"
    );
    const completionEligibleClean = completionEligible.filter((t) => t.completedClean).length;
    const totalWriteStepsRerun = trials.reduce((acc, t) => acc + (t.writeStepsRerun || 0), 0);
    const totalJournalDivergence = trials.filter((t) => t.journalDivergence).length;
    const midFlight = trials.filter(
      (t) => t.phase === "after_intent_before_call" || t.phase === "during_call"
    );
    const awaitOk = awaitTrials.filter((t) => t.ok).length;
    const awaitFailed = awaitTrials.filter((t) => !t.ok);
    const awaitFailureByReason = {};
    for (const t of awaitFailed) {
      const reason = t.failureReason || (t.detail?.startsWith("park failed") ? "await_park_failed" : "unknown");
      awaitFailureByReason[reason] = (awaitFailureByReason[reason] || 0) + 1;
    }
    const writeKillDone = trials.length >= N;
    const awaitDone = awaitTrials.length >= AWAIT_TRIALS;
    const complete = writeKillDone && awaitDone;
    const overallDenom = trials.length + awaitTrials.length;
    const correctnessItems = [
      ...trials.filter((t) => t.failureClass === "correctness"),
      ...awaitTrials.filter((t) => t.failureClass === "correctness"),
    ];
    const availabilityItems = [
      ...trials.filter((t) => t.failureClass === "availability"),
      ...awaitTrials.filter((t) => t.failureClass === "availability"),
    ];
    const correctnessFailures = correctnessItems.length;
    const availabilityFailures = availabilityItems.length;
    const availabilityFailureRate =
      overallDenom > 0 ? availabilityFailures / overallDenom : null;
    const outerMisses = completionEligible
      .filter((t) => !t.completedClean)
      .map((t) => ({
        i: t.i,
        phase: t.phase,
        failureClass: t.failureClass || (t.pauseFailed ? "availability" : null),
        failureReason: t.failureReason || (t.pauseFailed ? "pause_failed" : null),
        resumeMs: t.resumeMs ?? null,
        detail: t.detail ?? null,
      }));
    const allResumeIncludingAwait = [
      ...trials.filter((t) => t.resumeMs != null).map((t) => t.resumeMs),
      ...awaitTrials.filter((t) => t.resumeMs != null).map((t) => t.resumeMs),
    ].sort((a, b) => a - b);
    const gates =
      SCORE_MODE === "correctness_availability_v2"
        ? {
            scoreMode: SCORE_MODE,
            correctness: {
              failures: correctnessFailures,
              pass: correctnessFailures === 0,
              items: correctnessItems.slice(0, 50).map((t) => ({
                i: t.i ?? t.a,
                phase: t.phase ?? "await_approval",
                failureReason: t.failureReason,
              })),
              meaning:
                "wrong outcome only — duplicates, journal_divergence, write rerun, digest_mismatch, lost_midflight_intent (survivor status lacks intent/pauseKind after mid-flight kill)",
            },
            availability: {
              failures: availabilityFailures,
              denominator: overallDenom,
              failureRate: availabilityFailureRate,
              ceiling: AVAIL_CEILING,
              pass:
                availabilityFailureRate != null && availabilityFailureRate <= AVAIL_CEILING,
              resumeMs: {
                p50: percentile(allResumeIncludingAwait, 50),
                p99: percentile(allResumeIncludingAwait, 99),
                max: allResumeIncludingAwait.length
                  ? allResumeIncludingAwait[allResumeIncludingAwait.length - 1]
                  : null,
              },
              recoveryMs: {
                n: allRecovery.length,
                p50: percentile(allRecovery, 50),
                p99: percentile(allRecovery, 99),
                max: allRecovery.length ? allRecovery[allRecovery.length - 1] : null,
              },
              items: availabilityItems.slice(0, 50).map((t) => ({
                i: t.i ?? t.a,
                phase: t.phase ?? "await_approval",
                failureReason: t.failureReason,
                resumeMs: t.resumeMs ?? null,
                recoveryMs: t.recoveryMs ?? null,
              })),
              meaning:
                "no outcome in wall-clock time (recovery inclusive) — deadline miss, pause_failed, twin_capture_failed, await not survive/complete; failure-rate ceiling fixed before run; resumeMs/recoveryMs/resumeActiveMs tails reported without a pass/fail ceiling",
            },
            outerCompletion: {
              rateOuterPhases: completionEligible.length
                ? completionEligibleClean / completionEligible.length
                : null,
              outerPhaseN: completionEligible.length,
              cleanCompletionsOuter: completionEligibleClean,
              misses: outerMisses,
              meaning:
                "reported overall; each miss assigned to correctness or availability — not a separate zero-gate",
            },
          }
        : {
            scoreMode: SCORE_MODE,
            note: "legacy_zero_deadline — ok requires zero deadline misses and all phase expectations",
          };
    const okV2 =
      complete &&
      correctnessFailures === 0 &&
      availabilityFailureRate != null &&
      availabilityFailureRate <= AVAIL_CEILING;
    const okLegacy = complete && zeroDup && totalDeadlineMisses === 0 && allPhaseOk;
    return {
      kind: "celld-fleet-phased-kill",
      measuredAt: new Date().toISOString(),
      // Partial mid-run snapshots must not look like a finished clean board.
      ok: SCORE_MODE === "correctness_availability_v2" ? okV2 : okLegacy,
      status: complete ? "measured" : "partial",
      scoreMode: SCORE_MODE,
      gates,
      // Frozen before the run (see durability-proof STATUS v2). Recorded so post-hoc
      // loosening of deadline / denominator / ceiling is visible against this file.
      frozenCriteria:
        SCORE_MODE === "correctness_availability_v2"
          ? {
              resumeDeadlineMs: RESUME_DEADLINE_MS,
              resumeDeadlineMeaning:
                "wall clock including orchestrator recovery; same for write-kill and await",
              availabilityCeiling: AVAIL_CEILING,
              availabilityDenominator: "overallN",
              writeKillTrials: N,
              awaitApprovalTrials: AWAIT_TRIALS,
              overallTrials: N + AWAIT_TRIALS,
              tailsHavePassFailCeiling: false,
              note: "Do not change these after the run starts. Tails (resumeMs/recoveryMs/resumeActiveMs p99/max) are reported without a ceiling.",
            }
          : null,
      n: N,
      trialsCompleted: trials.length,
      awaitTrialsCompleted: awaitTrials.length,
      awaitTrialsN: AWAIT_TRIALS,
      overallN: N + AWAIT_TRIALS,
      phases: PHASES,
      wedgeHealth: WEDGE_HEALTH,
      wedgeHoldMs: WEDGE_HEALTH ? WEDGE_HOLD_MS : 0,
      celldBinaryVersion: CELLD_BINARY_VERSION,
      fenceMode: FENCE_MODE,
      outputGate: OUTPUT_GATE_ON,
      fencedAck: FENCED_ACK_ON,
      allowUnfenced: ALLOW_UNFENCED,
      rustLog: process.env.RUST_LOG || process.env.CELLD_RUST_LOG || null,
      nodeCount: 2,
      storageProvider: "cloudflare-r2",
      bucketRedacted: true,
      diagnoseConditionalWrite: "ok",
      celldTtlMs: CELLD_TTL_MS,
      resumeDeadlineMs: RESUME_DEADLINE_MS,
      /**
       * Every write-kill and await trial is counted. Column rates use property-specific
       * denominators (not a filtered subset of “good” trials). See each note.
       */
      trialAccounting: {
        writeKillTrials: N,
        awaitApprovalTrials: AWAIT_TRIALS,
        overallTrials: N + AWAIT_TRIALS,
        filteredOut: 0,
        byPhase: Object.fromEntries(
          PHASES.map((p) => {
            const pt = trials.filter((t) => t.phase === p);
            return [
              p,
              {
                n: pt.length,
                completedClean: pt.filter((t) => t.completedClean).length,
                outcomeUnknown: pt.filter((t) => t.outcomeUnknown).length,
                statePreservedEligible: pt.filter((t) => t.statePreserved != null).length,
                statePreservedTrue: pt.filter(
                  (t) => t.statePreserved === true || t.statePreserved?.preserved === true
                ).length,
                expectOutcomeUnknown:
                  p === "after_intent_before_call" || p === "during_call",
                inCompletedOuterDenominator:
                  p === "before_intent" || p === "after_call_before_journal",
              },
            ];
          })
        ),
        completed: {
          denominatorAllPhases: trials.length,
          cleanCompletions: totalCompletedClean,
          denominatorOuterPhases: completionEligible.length,
          cleanCompletionsOuter: completionEligibleClean,
          midFlightExcludedFromOuter: midFlight.length,
          note: "rateOuterPhases uses only before_intent + after_call_before_journal. Mid-flight phases (after_intent_before_call, during_call) are expected to end outcome_unknown — they are counted in n / rateAllPhases but not in the outer completion window. No trials are dropped.",
        },
        statePreserved: {
          denominator: stateEligible,
          preserved: statePreserved,
          twinCaptureFailures: stateTwinFailures,
          digestMismatches: trials.filter((t) => t.statePreserved?.reason === "digest_mismatch")
            .length,
          midFlightExcluded: midFlight.length,
          outerIncompleteExcluded: completionEligible.length - stateEligible,
          note: "Eligible = outer-phase trials that completedClean. Failures classify as twin_capture_failed (baseline twin never completed — often fleet SELF-FENCE) vs digest_mismatch (twin completed but digests differ). Both fail the rate; they are not the same cause. Mid-flight excluded by definition.",
        },
        waitApproval: {
          denominator: AWAIT_TRIALS,
          ok: awaitOk,
          note: "Separate arm (FLEET_PHASED_AWAIT_TRIALS), not a subset of write-kill N. Every await trial is in this denominator.",
        },
        stepsRepeated: {
          denominator: trials.length,
          writeStepsRerun: totalWriteStepsRerun,
          note: "Sum of pets-ledger duplicates across all write-kill trials (target 0).",
        },
      },
      columns: {
        duplicates: {
          total: totalDuplicates,
          zeroDuplicates: zeroDup,
          ruleOfThreeUpperBound95: upper95,
          meaning: "safety — never repeated a write",
        },
        outcomeUnknown: {
          total: trials.filter((t) => t.outcomeUnknown).length,
          rate: trials.length ? trials.filter((t) => t.outcomeUnknown).length / trials.length : 0,
          meaning: "honest uncertainty — person resolves",
        },
        availability: {
          survivorSelfFences: totalSelfFences,
          survivorSelfFenceRate: trials.length ? totalSelfFences / trials.length : 0,
          survivorRestarts: totalSurvivorRestarts,
          resumeDeadlineMisses: totalDeadlineMisses,
          recoveryMs: {
            n: allRecovery.length,
            p50: percentile(allRecovery, 50),
            p95: percentile(allRecovery, 95),
            p99: percentile(allRecovery, 99),
          },
          meaning:
            "availability — lease self-fence + orchestrator restart counted; recovery folded into resumeMs",
        },
        completed: {
          cleanCompletions: totalCompletedClean,
          rateAllPhases: trials.length ? totalCompletedClean / trials.length : 0,
          rateOuterPhases: completionEligible.length
            ? completionEligibleClean / completionEligible.length
            : 0,
          outerPhaseN: completionEligible.length,
          meaning:
            "claim-path §1 — % of resumed programs that reached completed without outcome_unknown; outer phases (before_intent / after_call_before_journal) are the fair completion window; mid-flight phases expect unknown",
        },
        stepsRepeated: {
          writeStepsRerun: totalWriteStepsRerun,
          zeroWriteStepsRerun: totalWriteStepsRerun === 0,
          journalDivergence: totalJournalDivergence,
          meaning:
            "claim-path §1 — completed write steps that ran again on the host (pets ledger duplicates); target 0. journal_divergence hard-stops when a stored entry no longer matches the plan (ProgramCellDO + Node durable-runner)",
        },
        statePreserved: {
          measured: STATE_BASELINE && stateEligible > 0,
          nodeUnitGolden: true,
          fleetBaselinePaired: STATE_BASELINE,
          compareMode: "digest_equality",
          eligibleN: stateEligible,
          preservedN: statePreserved,
          twinCaptureFailures: stateTwinFailures,
          digestMismatches: trials.filter((t) => t.statePreserved?.reason === "digest_mismatch")
            .length,
          rate: stateEligible > 0 ? statePreserved / stateEligible : null,
          meaning:
            "claim-path §1 — exact digest equality vs per-trial no-crash twin. Per-trial reason: digest_match | digest_mismatch | twin_capture_failed (twin never completed; not evidence the resume mutated state). Mid-flight excluded (see trialAccounting).",
        },
        waitApproval: {
          measured: AWAIT_TRIALS > 0,
          nodeAwaitApproval: true,
          densityRestartSurvival: true,
          fleetAwaitTrials: AWAIT_TRIALS > 0,
          n: AWAIT_TRIALS,
          ran: awaitTrials.length,
          ok: awaitOk,
          failed: awaitFailed.length,
          survivedRate:
            AWAIT_TRIALS > 0 ? awaitTrials.filter((t) => t.survived).length / AWAIT_TRIALS : null,
          completedAfterApproveRate:
            AWAIT_TRIALS > 0
              ? awaitTrials.filter((t) => t.completedAfterApprove).length / AWAIT_TRIALS
              : null,
          okRate: AWAIT_TRIALS > 0 ? awaitOk / AWAIT_TRIALS : null,
          failureByReason: awaitFailureByReason,
          meaning:
            "claim-path §4 — await_approval parks while pending, survives peer SIGKILL, then completes after approve (observe-only; never consumes). Separate arm from write-kill phases (see trialAccounting.waitApproval). okRate uses planned n; also report ran/ok/failed + failureByReason so incomplete or park-fail meltdowns are not ambiguous.",
        },
      },
      // Prefer all failures + a sample of successes (v1 only kept first 50, hiding the park_failed tail).
      awaitTrials: [
        ...awaitFailed,
        ...awaitTrials.filter((t) => t.ok).slice(0, 30),
      ].slice(0, 250),
      awaitFailureSummary: {
        ran: awaitTrials.length,
        planned: AWAIT_TRIALS,
        ok: awaitOk,
        failed: awaitFailed.length,
        byReason: awaitFailureByReason,
      },
      totalDuplicates,
      zeroDuplicates: zeroDup,
      ruleOfThreeUpperBound95: upper95,
      totalSurvivorSelfFences: totalSelfFences,
      totalSurvivorRestarts: totalSurvivorRestarts,
      totalResumeDeadlineMisses: totalDeadlineMisses,
      claim: (() => {
        const p50 = percentile(allResume, 50);
        const aboutSec = p50 != null ? Math.round(p50 / 1000) : null;
        const fenceRate = trials.length ? totalSelfFences / trials.length : 0;
        const deadlineRate = trials.length ? totalDeadlineMisses / trials.length : 0;
        const upperPct = upper95 != null ? `${(upper95 * 100).toFixed(1)}%` : "n/a";
        const median =
          aboutSec != null
            ? `The median resume took about ${aboutSec} seconds, set by the lease timeout.`
            : "Resume latency is set by the lease timeout.";
        return (
          `Across ${trials.length} crashes injected at every phase of a write, programs resumed on another node with no repeated writes` +
          (zeroDup && upper95 != null
            ? ` (the 95% upper bound on the duplicate rate is ${upperPct})`
            : "") +
          `. ${median} Writes caught mid-flight are marked outcome unknown for a person to resolve. Under these settings, ${(fenceRate * 100).toFixed(1)}% of surviving nodes paused themselves for safety, and ${(deadlineRate * 100).toFixed(1)}% of resumes missed the recovery deadline.`
        );
      })(),
      honesty:
        "Two celld nodes, one object-storage provider (R2). Not durable execution / exactly-once. Columns: duplicates (safety), outcome_unknown (uncertainty), survivor self-fence/restart (availability), claim-path completed + stepsRepeated, plus statePreserved (exact digest equality vs per-trial no-crash twin on outer phases) and waitApproval (separate FLEET_PHASED_AWAIT_TRIALS arm). Denominators: see trialAccounting — no trials filtered; outer-only rates exclude mid-flight kills that intentionally end outcome_unknown. Completed reads are journaled and replayed; an interrupted read with no entry is re-requested once (resumption assumes that re-read is acceptable). Model calls: at most one repeated model request per crash, never a repeated write. Aggregate outcome_unknown ≈ half only because kills are aimed evenly at four phases — two are the in-flight window; outer phases must stay 0 (nonzero = bug). Resume p50 ≈ lease TTL + detection (failover floor).",
      resumeMs: {
        p50: percentile(allResume, 50),
        p95: percentile(allResume, 95),
        p99: percentile(allResume, 99),
        p999: percentile(allResume, 99.9),
        includesSurvivorRecovery: true,
      },
      failoverAboutSec: (() => {
        const p50 = percentile(allResume, 50);
        return p50 != null ? Math.round(p50 / 1000) : null;
      })(),
      lease,
      byPhase,
      trialFailures: trials.filter((t) => !t.ok).slice(0, 50),
      availabilityIncidents: trials
        .filter((t) => t.survivorSelfFence || t.survivorRestart || t.resumeDeadlineMiss)
        .slice(0, 100)
        .map((t) => ({
          i: t.i,
          phase: t.phase,
          survivorSelfFence: t.survivorSelfFence,
          survivorRestart: t.survivorRestart,
          resumeDeadlineMiss: t.resumeDeadlineMiss,
          resumeMs: t.resumeMs,
          recoveryMs: t.recoveryMs,
          ok: t.ok,
        })),
    };
  }

  function writeEvidencePartial() {
    const evidence = summarize();
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(evidence, null, 2) + "\n");
    return evidence;
  }

  const evidence = writeEvidencePartial();
  console.log(
    `fleet-phased: done n=${N} dups=${totalDuplicates} fences=${totalSelfFences} restarts=${totalSurvivorRestarts} deadlineMiss=${totalDeadlineMisses} zeroDuplicates=${evidence.zeroDuplicates} upper95=${evidence.ruleOfThreeUpperBound95} scoreMode=${SCORE_MODE} ok=${evidence.ok}`
  );
  if (SCORE_MODE === "correctness_availability_v2" && evidence.gates) {
    console.log(
      `fleet-phased: gates correctnessFailures=${evidence.gates.correctness?.failures} availRate=${evidence.gates.availability?.failureRate} availCeiling=${AVAIL_CEILING} resumeMs.p99=${evidence.gates.availability?.resumeMs?.p99} resumeMs.max=${evidence.gates.availability?.resumeMs?.max}`
    );
  }
  console.log(`wrote ${OUT}`);
  cleanup();
  if (SCORE_MODE === "correctness_availability_v2") {
    if (!evidence.ok) process.exit(1);
  } else if (
    totalDuplicates > 0 ||
    totalDeadlineMisses > 0 ||
    evidence.trialFailures.length > 0
  ) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
