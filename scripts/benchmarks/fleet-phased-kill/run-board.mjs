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
 *   statePreserved      — claim-path §1: scaffolding only until fleet pairs a no-crash baseline
 *   waitApproval        — claim-path §4: scaffolding; Node await_approval + density survival
 *
 * Env:
 *   FLEET_PHASED_N                   total trials (default 100; lab target 1000)
 *   FLEET_PHASED_EVIDENCE            output path
 *   FLEET_PHASED_RESUME_DEADLINE_MS  resume+recovery budget (default 60000)
 *   CELLD_TTL_MS                     passed through to celld (default stock 10000)
 *   CELLD_BUCKET / S3_ENDPOINT / AWS_* or CLAWQL_SYNC_* + CLAWQL_R2_ACCOUNT_ID
 *   STREAMS_CELLD_FLEET_REQUIRED=1 to fail closed without bucket
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, openSync, unlinkSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../..");
const STREAMS = join(REPO, "docs/examples/streams-celld");
const PHASES = [
  "before_intent",
  "after_intent_before_call",
  "during_call",
  "after_call_before_journal",
];

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

async function waitUrl(url, pred, attempts = 120, delayMs = 250) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetchJson(url, {}, 5_000);
      if (pred(r)) return r;
    } catch {
      /* retry */
    }
    await sleep(delayMs);
  }
  throw new Error(`timeout waiting for ${url}`);
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function phasePlan(phase, programId) {
  const writeIdx = 2;
  const calls = [
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
  const pets = spawnLogged(
    process.execPath,
    [join(STREAMS, "scripts/mock-pets-upstream.mjs"), String(PETS_PORT)],
    petsLog
  );

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
    },
    B: {
      port: PORT_B,
      internal: INTERNAL_B,
      pid: null,
      log: "/tmp/fleet-phased-b.log",
      lastExit: null,
      pendingSelfFence: false,
    },
  };

  function startNode(name) {
    const n = nodes[name];
    if (n.pid) {
      try {
        process.kill(n.pid, "SIGKILL");
      } catch {
        /* */
      }
      n.pid = null;
    }
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
      process.env
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
   * @param {{ requireProgram?: boolean, programAttempts?: number, cell?: string }} [opts]
   */
  async function waitNode(name, opts = {}) {
    const requireProgram = opts.requireProgram !== false;
    const programAttempts = opts.programAttempts ?? 180; // ~45s — match smoke wait_program
    // Probe a dedicated cell — never the trial DO — so readiness does not fight
    // ownership of the program under test (worker defaults cell=default otherwise).
    const cell = opts.cell || "health";
    const base = `http://127.0.0.1:${nodes[name].port}`;
    await waitUrl(`${base}/health`, (r) => r.ok, 240, 250);
    if (!requireProgram) return;
    await waitUrl(
      `${base}/program/health?cell=${encodeURIComponent(cell)}`,
      (r) => r.ok && /ProgramCellDO/.test(JSON.stringify(r.body)),
      programAttempts,
      250
    );
  }

  async function restartNode(name) {
    startNode(name);
    try {
      await waitNode(name, { requireProgram: true, programAttempts: 120 });
    } catch (err) {
      console.warn(`fleet-phased: waitNode(${name}) failed (${err.message}); retry once`);
      startNode(name);
      await sleep(1500);
      await waitNode(name, { requireProgram: true, programAttempts: 180 });
    }
  }

  async function rebuildFleet() {
    console.warn("fleet-phased: rebuilding both nodes after ownership/ready stall");
    startNode("A");
    startNode("B");
    await sleep(2000);
    await waitNode("A", { requireProgram: true, programAttempts: 180 });
    await waitNode("B", { requireProgram: true, programAttempts: 180 });
  }

  /**
   * Ensure survivor is alive for resume. Counts self-fence / restart; time spent
   * here is charged to the caller's resume clock (recovery ⊆ resumeMs).
   */
  async function ensureSurvivor(name, counters) {
    const n = nodes[name];
    if (n.pendingSelfFence) {
      counters.survivorSelfFence = true;
      n.pendingSelfFence = false;
    }
    if (!n.pid) {
      if (n.lastExit?.selfFence) counters.survivorSelfFence = true;
      counters.survivorRestart = true;
      const t0 = Date.now();
      await restartNode(name);
      counters.recoveryMs += Date.now() - t0;
      return;
    }
    try {
      await waitNode(name);
    } catch {
      if (n.lastExit?.selfFence || n.pendingSelfFence) counters.survivorSelfFence = true;
      n.pendingSelfFence = false;
      counters.survivorRestart = true;
      const t0 = Date.now();
      await restartNode(name);
      counters.recoveryMs += Date.now() - t0;
    }
  }

  // Start both nodes before waiting — a solo node with fleet durability may
  // never open ready_gate /program/health until a peer exists.
  startNode("A");
  startNode("B");
  await sleep(2000);
  await waitNode("A", { requireProgram: true, programAttempts: 180 });
  await waitNode("B", { requireProgram: true, programAttempts: 180 });
  console.log("fleet-phased: both nodes /health + /program/health ready");

  const phaseStats = emptyPhaseStats();
  const trials = [];
  let totalDuplicates = 0;
  let totalSelfFences = 0;
  let totalSurvivorRestarts = 0;
  let totalDeadlineMisses = 0;
  let primary = "A";
  const boardStarted = Date.now();
  // Trials use the worker default DO (program:default) — same as the proven
  // smoke + N=8 PASS. After SIGKILL, wait for survivor /program/health before
  // resume (ownership transfer); that wait is inside resumeMs.

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
      if (nodes[victim].pid) {
        process.kill(nodes[victim].pid, "SIGKILL");
        nodes[victim].pid = null;
      }
      ac.abort();
      await runPromise;
      for (let w = 0; w < 30; w++) {
        const ledger = await fetchJson(`http://127.0.0.1:${PETS_PORT}/__writes`);
        if ((ledger.body?.inFlight || 0) === 0) break;
        await sleep(100);
      }
      runRes = { body: { status: "paused_for_kill", pauseKind: "during_call" } };
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

    // Resume clock includes ownership transfer (/program/health) + any survivor
    // restart + the resume HTTP call (availability cost visible in p99/p999).
    const resumeStart = Date.now();
    if (!nodes[survivor].pid || nodes[survivor].pendingSelfFence) {
      await ensureSurvivor(survivor, avail);
    }

    // Smoke parity: wait until survivor can route ProgramCellDO before resume.
    while (Date.now() - resumeStart < RESUME_DEADLINE_MS) {
      if (!nodes[survivor].pid || nodes[survivor].pendingSelfFence) {
        await ensureSurvivor(survivor, avail);
      }
      const ph = await fetchJson(`${baseS}/program/health`, {}, 5_000);
      if (ph.ok && /ProgramCellDO/.test(JSON.stringify(ph.body))) break;
      await sleep(250);
    }

    let resume = { ok: false, status: 0, body: null, fetchError: true };
    while (Date.now() - resumeStart < RESUME_DEADLINE_MS) {
      if (!nodes[survivor].pid || nodes[survivor].pendingSelfFence) {
        await ensureSurvivor(survivor, avail);
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
      if (resume.ok || resume.status === 404 || (resume.status && resume.status !== 0)) break;
      await sleep(100);
    }
    if (!(
      resume.ok ||
      (resume.status === 404 && resume.body?.error === "not_found") ||
      (resume.status && resume.status !== 500 && !resume.fetchError)
    )) {
      // Deadline miss if we never got a definitive program response.
      if (!resume.ok && (resume.fetchError || resume.status === 500 || resume.status === 0)) {
        avail.resumeDeadlineMiss = true;
      }
    }
    const resumeMs = Date.now() - resumeStart;

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
    if (expectOk) st.ok += 1;
    else st.failures += 1;

    trials.push({
      i,
      phase,
      ok: expectOk,
      duplicates,
      writeCount,
      outcomeUnknown,
      completedClean,
      journalDivergence,
      writeStepsRerun,
      replayedSteps,
      resumeMs,
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
      startNode(victim);
      await waitNode(victim, { requireProgram: false });
    } catch (err) {
      console.warn(`fleet-phased: victim ${victim} restart failed (${err.message}); rebuild fleet`);
      await rebuildFleet();
    }
    primary = survivor;

    if ((i + 1) % 10 === 0 || i === N - 1) {
      const elapsedSec = (Date.now() - boardStarted) / 1000;
      const rate = (i + 1) / Math.max(1, elapsedSec);
      const etaMin = ((N - i - 1) / Math.max(0.01, rate) / 60).toFixed(1);
      console.log(
        `fleet-phased: ${i + 1}/${N} dups=${totalDuplicates} fences=${totalSelfFences} restarts=${totalSurvivorRestarts} deadlineMiss=${totalDeadlineMisses} last=${phase} ok=${expectOk} resumeMs=${resumeMs} rate=${rate.toFixed(2)}/s eta=${etaMin}m`
      );
      writeEvidencePartial();
    }
  }

  function summarize() {
    const allResume = trials
      .filter((t) => t.resumeMs != null)
      .map((t) => t.resumeMs)
      .sort((a, b) => a - b);
    const allRecovery = trials
      .filter((t) => t.recoveryMs > 0)
      .map((t) => t.recoveryMs)
      .sort((a, b) => a - b);
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
    return {
      kind: "celld-fleet-phased-kill",
      measuredAt: new Date().toISOString(),
      // Safety + liveness: zero dups, zero deadline misses, every phase expectation met.
      // Self-fence with counted recovery does not fail ok by itself.
      ok: zeroDup && totalDeadlineMisses === 0 && allPhaseOk,
      status: "measured",
      n: N,
      nodeCount: 2,
      storageProvider: "cloudflare-r2",
      bucketRedacted: true,
      diagnoseConditionalWrite: "ok",
      celldTtlMs: CELLD_TTL_MS,
      resumeDeadlineMs: RESUME_DEADLINE_MS,
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
          measured: false,
          nodeUnitGolden: true,
          fleetBaselinePaired: false,
          meaning:
            "claim-path §1 — program step outcomes after resume match the no-crash baseline. Proven on Node durable-runner + kill-node stand-in via compareProgramStepStateEffect; this fleet board does not yet pair each trial with a no-crash baseline, so no rate is quoted here",
        },
        waitApproval: {
          measured: false,
          nodeAwaitApproval: true,
          densityRestartSurvival: true,
          fleetAwaitTrials: false,
          meaning:
            "claim-path §4 — long waits that survive crash/failover. Node plan await_approval parks while pending and resumes after settle (observe-only); density board already measures deadline restartSurvival. This fleet phased harness does not yet inject await_approval waits, so no rate is quoted here",
        },
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
        "Two celld nodes, one object-storage provider (R2). Not durable execution / exactly-once. Columns: duplicates (safety), outcome_unknown (uncertainty), survivor self-fence/restart (availability), plus claim-path completed + stepsRepeated (lab n=100 rates in phased-claim-path-columns-n100.json) + statePreserved + waitApproval scaffolding (fleet await trials / baseline pairing not yet injected). Aggregate outcome_unknown ≈ half only because kills are aimed evenly at four phases — two are the in-flight window; outer phases must stay 0 (nonzero = bug). Real crashes mostly miss that brief window. Resume p50 ≈ lease TTL + detection (failover floor); raising TTL alone slows every crash. Preferred levers (planned, not measured): renew more often within the same TTL, regional lease store — see AVAILABILITY.md / TTL-TRADEOFF.md.",
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
    `fleet-phased: done n=${N} dups=${totalDuplicates} fences=${totalSelfFences} restarts=${totalSurvivorRestarts} deadlineMiss=${totalDeadlineMisses} zeroDuplicates=${evidence.zeroDuplicates} upper95=${evidence.ruleOfThreeUpperBound95}`
  );
  console.log(`wrote ${OUT}`);
  cleanup();
  if (totalDuplicates > 0 || totalDeadlineMisses > 0 || evidence.trialFailures.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
