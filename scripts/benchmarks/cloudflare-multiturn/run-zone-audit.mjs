#!/usr/bin/env node
/**
 * Cloudflare 12-step zone audit — scripted harness (smoke / baseline).
 *
 *   node scripts/benchmarks/cloudflare-multiturn/generate-synthetic-fixture.mjs
 *   node scripts/benchmarks/cloudflare-multiturn/run-zone-audit.mjs
 *   CF_MT_ITERS=50 CF_MT_ARM=direct node ...
 *
 * Arms in this smoke: `direct` (no gateway). Full interleaved 10k board is a follow-up
 * once ClawQL / Executor / MJ / AG / CF code-mode adapters are wired.
 */
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { getEncoding } from "js-tiktoken";
import { FAKE } from "./lib/fixture-ids.mjs";
import { buildExpectations, checkStep } from "./lib/success-checks.mjs";
import { executorV2Scripts, CLOUDFLARE_CODE_MODE } from "./code-mode/published-scripts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");
const FIXTURE = process.env.FIXTURE || join(HERE, "fixtures/recording.synthetic.json");
const MOCK = join(HERE, "mock/cloudflare-replay-mock.mjs");
const OUT_DIR = process.env.CF_MT_OUT_DIR || join(ROOT, "docs/benchmarks/cloudflare-multiturn");
const ITERS = Math.max(1, Number(process.env.CF_MT_ITERS || 3) || 3);
const ARM = (process.env.CF_MT_ARM || "direct").trim();
const LATENCY = process.env.MT_UPSTREAM_LATENCY || "0";
const enc = getEncoding("cl100k_base");

function countTokens(text) {
  if (text == null || text === "") return 0;
  return enc.encode(String(text)).length;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

async function waitTcp(port, ms = 30000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const c = createConnection({ host: "127.0.0.1", port }, () => {
        c.end();
        resolve(true);
      });
      c.on("error", () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error("mock tcp timeout");
}

async function startMock() {
  if (!existsSync(FIXTURE)) {
    throw new Error(`fixture missing — run generate-synthetic-fixture.mjs first: ${FIXTURE}`);
  }
  const child = spawn(process.execPath, [MOCK], {
    env: { ...process.env, FIXTURE, MT_UPSTREAM_LATENCY: LATENCY },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let ready = null;
  let buf = "";
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("mock ready timeout")), 20000);
    child.stdout.on("data", (d) => {
      buf += d.toString();
      const line = buf.split("\n").find((l) => l.includes('"ready"'));
      if (line) {
        try {
          ready = JSON.parse(line);
          clearTimeout(t);
          resolve();
        } catch {
          /* keep */
        }
      }
    });
    child.stderr.on("data", (d) => process.stderr.write(d));
    child.on("exit", (c) => reject(new Error(`mock exited ${c}`)));
  });
  const port = Number(new URL(ready.baseUrl).port);
  await waitTcp(port);
  return { child, baseUrl: ready.baseUrl, ready };
}

async function cfGet(baseUrl, path) {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const t0 = performance.now();
  const res = await fetch(url);
  const text = await res.text();
  const ms = performance.now() - t0;
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text, ms, url, tokens: countTokens(text) };
}

/** Direct REST baseline — all curated defs conceptually in context; raw responses. */
async function runDirectSession(baseUrl, expectations) {
  const steps = [];
  let sessionOk = true;
  const t0 = performance.now();

  // 1 list zones
  {
    const r = await cfGet(baseUrl, "/zones");
    const zone = r.json?.result?.find((z) => z.name === FAKE.auditZoneName);
    const observed = { zoneId: zone?.id };
    const check = checkStep(1, observed, expectations);
    sessionOk &&= check.ok;
    steps.push({ step: 1, calls: 1, resultTokens: r.tokens, latency_ms: r.ms, check, observed });
  }
  const zoneId = steps[0].observed.zoneId;

  // 2 zone details
  {
    const r = await cfGet(baseUrl, `/zones/${zoneId}`);
    const observed = { status: r.json?.result?.status, planName: r.json?.result?.plan?.name };
    const check = checkStep(2, observed, expectations);
    sessionOk &&= check.ok;
    steps.push({ step: 2, calls: 1, resultTokens: r.tokens, latency_ms: r.ms, check, observed });
  }

  // 3 ssl
  {
    const r = await cfGet(baseUrl, `/zones/${zoneId}/settings/ssl`);
    const observed = { ssl: r.json?.result?.value };
    const check = checkStep(3, observed, expectations);
    sessionOk &&= check.ok;
    steps.push({ step: 3, calls: 1, resultTokens: r.tokens, latency_ms: r.ms, check, observed });
  }

  // 4–6 dns list once, then filter locally (pass-through baseline pays full list tokens once per filter step if naive;
  // scripted baseline filters from one fetch for honesty on "could filter client-side")
  {
    const r = await cfGet(baseUrl, `/zones/${zoneId}/dns_records?per_page=500`);
    const records = r.json?.result || [];
    const aCount = records.filter((x) => x.type === "A").length;
    const names = records
      .filter((x) => x.type === "A" && x.content === FAKE.targetIp)
      .map((x) => x.name);
    const unproxiedNames = records
      .filter((x) => x.type === "A" && x.content === FAKE.targetIp && x.proxied === false)
      .map((x) => x.name);

    const c4 = checkStep(4, { aRecordCount: aCount }, expectations);
    const c5 = checkStep(5, { names }, expectations);
    const c6 = checkStep(6, { unproxiedNames }, expectations);
    sessionOk &&= c4.ok && c5.ok && c6.ok;
    // Attribute full list tokens to step 4; 5–6 are pure local filter (0 result tokens).
    steps.push({ step: 4, calls: 1, resultTokens: r.tokens, latency_ms: r.ms, check: c4, observed: { aRecordCount: aCount } });
    steps.push({ step: 5, calls: 0, resultTokens: 0, latency_ms: 0, check: c5, observed: { names }, note: "client filter from step 4" });
    steps.push({ step: 6, calls: 0, resultTokens: 0, latency_ms: 0, check: c6, observed: { unproxiedNames }, note: "client filter from step 4" });
  }

  // 7 workers
  {
    const r = await cfGet(baseUrl, `/accounts/${FAKE.accountId}/workers/scripts`);
    const observed = { scriptNames: (r.json?.result || []).map((s) => s.id) };
    const check = checkStep(7, observed, expectations);
    sessionOk &&= check.ok;
    steps.push({ step: 7, calls: 1, resultTokens: r.tokens, latency_ms: r.ms, check, observed });
  }

  // 8 worker settings
  {
    const r = await cfGet(
      baseUrl,
      `/accounts/${FAKE.accountId}/workers/scripts/${FAKE.workerScriptName}/settings`
    );
    const observed = { compatibilityDate: r.json?.result?.compatibility_date };
    const check = checkStep(8, observed, expectations);
    sessionOk &&= check.ok;
    steps.push({ step: 8, calls: 1, resultTokens: r.tokens, latency_ms: r.ms, check, observed });
  }

  // 9 routes
  {
    const r = await cfGet(baseUrl, `/zones/${zoneId}/workers/routes`);
    const route = (r.json?.result || []).find((x) => x.script === FAKE.workerScriptName);
    const observed = { routePattern: route?.pattern, script: route?.script };
    const check = checkStep(9, observed, expectations);
    sessionOk &&= check.ok;
    steps.push({ step: 9, calls: 1, resultTokens: r.tokens, latency_ms: r.ms, check, observed });
  }

  // 10 r2
  {
    const r = await cfGet(baseUrl, `/accounts/${FAKE.accountId}/r2/buckets`);
    const buckets = (r.json?.result?.buckets || []).map((b) => ({
      name: b.name,
      creation_date: b.creation_date,
    }));
    const observed = { buckets };
    const check = checkStep(10, observed, expectations);
    sessionOk &&= check.ok;
    steps.push({ step: 10, calls: 1, resultTokens: r.tokens, latency_ms: r.ms, check, observed });
  }

  // 11 firewall
  {
    const r = await cfGet(baseUrl, `/zones/${zoneId}/firewall/rules`);
    const observed = {
      enabledRuleCount: (r.json?.result || []).filter((x) => x.paused === false).length,
    };
    const check = checkStep(11, observed, expectations);
    sessionOk &&= check.ok;
    steps.push({ step: 11, calls: 1, resultTokens: r.tokens, latency_ms: r.ms, check, observed });
  }

  // 12 gated proposal — never hits the network
  {
    const observed = {
      proposal: { recordId: FAKE.unproxiedRecordId, proxied: true },
      gated: true,
    };
    const check = checkStep(12, observed, expectations);
    sessionOk &&= check.ok;
    const proposalTokens = countTokens(JSON.stringify(observed));
    steps.push({
      step: 12,
      calls: 0,
      resultTokens: proposalTokens,
      latency_ms: 0,
      check,
      observed,
      note: "gated proposal — not sent to mock/Cloudflare",
    });
  }

  return {
    ok: sessionOk,
    session_ms: performance.now() - t0,
    steps,
    result_tokens_sum: steps.reduce((n, s) => n + (s.resultTokens || 0), 0),
    calls_sum: steps.reduce((n, s) => n + (s.calls || 0), 0),
  };
}

async function main() {
  const recording = JSON.parse(readFileSync(FIXTURE, "utf8"));
  const expectations = buildExpectations(recording.world);
  const mock = await startMock();

  const codeTok = Object.fromEntries(
    Object.entries(CLOUDFLARE_CODE_MODE).map(([k, v]) => [k, countTokens(v)])
  );
  const execScripts = executorV2Scripts(mock.baseUrl);
  const execTok = Object.fromEntries(
    Object.entries(execScripts).map(([k, v]) => [k, countTokens(v)])
  );

  const sessions = [];
  try {
    for (let i = 1; i <= ITERS; i++) {
      if (ARM !== "direct") {
        throw new Error(`arm ${ARM} not wired in smoke harness yet — use CF_MT_ARM=direct`);
      }
      const s = await runDirectSession(mock.baseUrl, expectations);
      sessions.push(s);
      if (i === 1 || i === ITERS || i % 10 === 0) {
        console.log(`[cf-mt] ${ARM} session ${i}/${ITERS} ok=${s.ok} resultTok=${s.result_tokens_sum} ms=${s.session_ms.toFixed(1)}`);
      }
      if (!s.ok) {
        console.error(JSON.stringify(s.steps.filter((x) => !x.check.ok), null, 2));
        throw new Error("task success failed on session " + i);
      }
    }
  } finally {
    try {
      mock.child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }

  const sessionMs = sessions.map((s) => s.session_ms).sort((a, b) => a - b);
  const resultTok = sessions.map((s) => s.result_tokens_sum);
  const out = {
    measuredAt: new Date().toISOString(),
    arm: ARM,
    catalog: "fixture-replay",
    fixture: {
      path: FIXTURE,
      source: recording.source,
      label: recording.label,
      dnsCount: recording.world?.dnsCount,
    },
    tokenizer: "js-tiktoken cl100k_base",
    iters: ITERS,
    latency_mode: LATENCY,
    task_success_rate: sessions.filter((s) => s.ok).length / sessions.length,
    result_tokens: {
      mean: resultTok.reduce((a, b) => a + b, 0) / resultTok.length,
      first_session: resultTok[0],
    },
    session_ms: {
      p50: percentile(sessionMs, 50),
      p99: percentile(sessionMs, 99),
      p999: percentile(sessionMs, 99.9),
    },
    first_session_steps: sessions[0].steps.map((s) => ({
      step: s.step,
      calls: s.calls,
      resultTokens: s.resultTokens,
      latency_ms: Number(s.latency_ms.toFixed(3)),
      ok: s.check.ok,
      note: s.note,
    })),
    code_mode_published_tokens: {
      cloudflare_api_mcp: { per_step: codeTok, sum: Object.values(codeTok).reduce((a, b) => a + b, 0) },
      executor_v2: { per_step: execTok, sum: Object.values(execTok).reduce((a, b) => a + b, 0) },
    },
    claims_scope: [
      "scripted direct baseline against synthetic fixture",
      "no Cloudflare network I/O",
      "step 12 gated proposal never sent",
    ],
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `smoke-${ARM}-${ITERS}.json`);
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  writeFileSync("/opt/cursor/artifacts/cloudflare-mt-smoke.json", JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify({ wrote: outPath, task_success_rate: out.task_success_rate, session_p50_ms: out.session_ms.p50 }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
