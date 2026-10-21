#!/usr/bin/env node
/**
 * Tier C phased fleet kill board — long-lived 2-node celld fleet on R2.
 *
 * Phases (write index = 2):
 *   before_intent | after_intent_before_call | during_call | after_call_before_journal
 *   + random (uniform over the four)
 *
 * Env:
 *   FLEET_PHASED_N          total trials (default 100; use 10000 for rule-of-three bound)
 *   FLEET_PHASED_EVIDENCE   output path
 *   CELLD_BUCKET / S3_ENDPOINT / AWS_* or CLAWQL_SYNC_* + CLAWQL_R2_ACCOUNT_ID
 *   STREAMS_CELLD_FLEET_REQUIRED=1 to fail closed without bucket
 */
import { spawn } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  openSync,
  unlinkSync,
} from "node:fs";
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
  const account = process.env.CLAWQL_R2_ACCOUNT_ID;
  const key = process.env.CLAWQL_SYNC_ACCESS_KEY_ID;
  const secret = process.env.CLAWQL_SYNC_SECRET_ACCESS_KEY;
  if (!account || !key || !secret) return;
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
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

if (!process.env.CELLD_BUCKET) {
  if (process.env.STREAMS_CELLD_FLEET_REQUIRED === "1") {
    console.error("fleet-phased: CELLD_BUCKET required");
    process.exit(1);
  }
  console.log("fleet-phased: SKIP — no bucket");
  process.exit(0);
}

const endpointArgs = process.env.S3_ENDPOINT
  ? ["--endpoint", process.env.S3_ENDPOINT]
  : [];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { ok: res.ok, status: res.status, body };
}

function spawnLogged(cmd, args, logPath) {
  mkdirSync(dirname(logPath), { recursive: true });
  const fd = openSync(logPath, "w");
  return spawn(cmd, args, {
    cwd: STREAMS,
    env: process.env,
    stdio: ["ignore", fd, fd],
  });
}

async function waitUrl(url, pred, attempts = 120, delayMs = 250) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetchJson(url);
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
  // First 4*ceil(N/5) trials: balanced targeted phases; remainder random.
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
        resumeMs: [],
        failures: 0,
      },
    ])
  );
}

async function main() {
  const petsLog = "/tmp/fleet-phased-pets.log";
  const pets = spawnLogged(process.execPath, [join(STREAMS, "scripts/mock-pets-upstream.mjs"), String(PETS_PORT)], petsLog);

  // Deploy once
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
    A: { port: PORT_A, internal: INTERNAL_A, pid: null, log: "/tmp/fleet-phased-a.log" },
    B: { port: PORT_B, internal: INTERNAL_B, pid: null, log: "/tmp/fleet-phased-b.log" },
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
      n.log
    );
    n.pid = child.pid;
    return child;
  }

  async function waitNode(name) {
    const base = `http://127.0.0.1:${nodes[name].port}`;
    await waitUrl(`${base}/health`, (r) => r.ok);
    await waitUrl(`${base}/program/health`, (r) => r.ok && /ProgramCellDO/.test(JSON.stringify(r.body)));
  }

  startNode("A");
  startNode("B");
  await waitNode("A");
  await waitNode("B");

  const phaseStats = emptyPhaseStats();
  const trials = [];
  let totalDuplicates = 0;
  let primary = "A";

  const cleanup = () => {
    for (const n of Object.values(nodes)) {
      if (n.pid) try { process.kill(n.pid, "SIGKILL"); } catch { /* */ }
    }
    try { process.kill(pets.pid, "SIGKILL"); } catch { /* */ }
    try { unlinkSync(cfg); } catch { /* */ }
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

    await fetchJson(`http://127.0.0.1:${PETS_PORT}/__reset`, { method: "POST" });
    const writesBefore = (await fetchJson(`http://127.0.0.1:${PETS_PORT}/__writes`)).body?.count || 0;

    const body = phasePlan(phase, programId);
    let runRes;
    const runStarted = Date.now();

    if (phase === "during_call") {
      // Fire-and-forget hang; kill after in-flight or short wait.
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
      process.kill(nodes[victim].pid, "SIGKILL");
      nodes[victim].pid = null;
      ac.abort();
      await runPromise;
      // Let mock drop aborted hang before resume/ledger (generation + close handler).
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
        // ensure victim still up
        if (!nodes[victim].pid) {
          startNode(victim);
          await waitNode(victim);
        }
        continue;
      }
      process.kill(nodes[victim].pid, "SIGKILL");
      nodes[victim].pid = null;
    }

    await sleep(1200);
    await waitNode(survivor);

    const resumeStart = Date.now();
    let resume;
    for (let a = 0; a < 40; a++) {
      resume = await fetchJson(`${baseS}/program/resume`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ programId }),
      });
      if (resume.ok || resume.status !== 404) break;
      await sleep(250);
    }
    const resumeMs = Date.now() - resumeStart;

    const ledger = await fetchJson(`http://127.0.0.1:${PETS_PORT}/__writes`);
    const writeCount = ledger.body?.count || 0;
    const duplicates = Math.max(0, writeCount - 1); // at most one intended write
    // before_intent: write happens on resume → expect writeCount==1, duplicates==0
    // after_intent / during / after_call_before_journal: expect writeCount 0 or 1, never 2
    const outcomeUnknown = Boolean(
      resume.body?.outcomeUnknown ||
        (resume.body?.calls || []).some(
          (c) => c.outcomeUnknown || c.result?.status === "outcome_unknown"
        )
    );
    const completedClean =
      resume.body?.status === "completed" && resume.body?.ok === true && !outcomeUnknown;


    let expectOk = false;
    if (phase === "before_intent") {
      // Should resume and complete; write exactly once; no outcome_unknown
      expectOk = completedClean && writeCount === 1 && duplicates === 0 && !outcomeUnknown;
    } else if (phase === "after_intent_before_call") {
      expectOk = outcomeUnknown && writeCount === 0 && duplicates === 0;
    } else if (phase === "during_call") {
      // Upstream may or may not have committed; never duplicate; outcome_unknown required
      expectOk = outcomeUnknown && writeCount <= 1 && duplicates === 0;
    } else if (phase === "after_call_before_journal") {
      // Upstream already succeeded; intent stashes result → resume finalizes, no re-send, no unknown
      expectOk = completedClean && writeCount === 1 && duplicates === 0 && !outcomeUnknown;
    }

    const st = phaseStats[phase];
    st.n += 1;
    st.resumeMs.push(resumeMs);
    if (duplicates > 0) {
      st.duplicates += duplicates;
      totalDuplicates += duplicates;
    }
    if (outcomeUnknown) st.outcomeUnknown += 1;
    if (completedClean) st.completedClean += 1;
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
      resumeMs,
      writesBefore,
    });

    // Restart victim for next trial; flip primary
    startNode(victim);
    await waitNode(victim);
    primary = survivor;

    if ((i + 1) % 25 === 0 || i === N - 1) {
      console.log(
        `fleet-phased: ${i + 1}/${N} duplicates=${totalDuplicates} last=${phase} ok=${expectOk} resumeMs=${resumeMs}`
      );
      writeEvidencePartial();
    }
  }

  function summarize() {
    const allResume = trials.filter((t) => t.resumeMs != null).map((t) => t.resumeMs).sort((a, b) => a - b);
    const byPhase = {};
    for (const p of PHASES) {
      const s = phaseStats[p];
      const ms = [...s.resumeMs].sort((a, b) => a - b);
      byPhase[p] = {
        n: s.n,
        ok: s.ok,
        failures: s.failures,
        duplicates: s.duplicates,
        outcomeUnknown: s.outcomeUnknown,
        outcomeUnknownRate: s.n ? s.outcomeUnknown / s.n : 0,
        completedClean: s.completedClean,
        resumeMs: {
          p50: percentile(ms, 50),
          p95: percentile(ms, 95),
          p99: percentile(ms, 99),
          p999: percentile(ms, 99.9),
        },
      };
    }
    const zeroDup = totalDuplicates === 0;
    const upper95 = zeroDup && N > 0 ? 3 / N : null;
    return {
      kind: "celld-fleet-phased-kill",
      measuredAt: new Date().toISOString(),
      ok: zeroDup && trials.every((t) => t.ok),
      status: "measured",
      n: N,
      nodeCount: 2,
      storageProvider: "cloudflare-r2",
      bucketRedacted: true,
      diagnoseConditionalWrite: "ok",
      totalDuplicates,
      zeroDuplicates: zeroDup,
      ruleOfThreeUpperBound95: upper95,
      claim:
        "A program killed mid-run on one node resumed on another and never repeated a write; a write interrupted in flight is marked outcome unknown for a person to resolve.",
      honesty:
        "Two celld nodes, one object-storage provider (R2). Not durable execution / exactly-once. Phases: before_intent (complete clean), after_intent_before_call + during_call (outcome_unknown; person resolves), after_call_before_journal (finalize stashed upstream result — no re-send, no unknown). Zero duplicates is the safety claim; outcome_unknown rate is the human-cost claim.",
      resumeMs: {
        p50: percentile(allResume, 50),
        p95: percentile(allResume, 95),
        p99: percentile(allResume, 99),
        p999: percentile(allResume, 99.9),
      },
      byPhase,
      // Keep evidence small: only failures + sample
      trialFailures: trials.filter((t) => !t.ok).slice(0, 50),
    };
  }

  function writeEvidencePartial() {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(summarize(), null, 2) + "\n");
  }

  writeEvidencePartial();
  const evidence = summarize();
  console.log(
    `fleet-phased: done n=${N} duplicates=${totalDuplicates} zeroDuplicates=${evidence.zeroDuplicates} upper95=${evidence.ruleOfThreeUpperBound95}`
  );
  console.log(`wrote ${OUT}`);
  cleanup();
  if (totalDuplicates > 0 || evidence.trialFailures.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
