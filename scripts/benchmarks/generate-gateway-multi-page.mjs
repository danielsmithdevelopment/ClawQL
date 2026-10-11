#!/usr/bin/env node
/**
 * Dedicated gateway multi-arm comparison page (tokens + latency + RSS + Bun).
 *
 *   node scripts/benchmarks/generate-gateway-multi-page.mjs
 *
 * Reads gateway-multi-multiturn-10k.json (+ optional pets Bun boards) and writes:
 *   docs/benchmarks/gateway-multi-comparison/index.html
 *   apps/www/public/benchmarks/gateway-multi-comparison/{index.html,board.json}
 */

import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROOT, "docs", "benchmarks", "gateway-multi-comparison");
const MT_JSON = join(DIR, "gateway-multi-multiturn-10k.json");
const PETS_BUN = join(DIR, "gateway-multi-cmp-ts7-bun-10k.json");
const PETS_NODE = join(DIR, "gateway-multi-cmp-ts7-node-10k.json");
const PETS_CHAOS_BUN = join(DIR, "gateway-multi-cmp-ts7-bun-chaos.json");
const PETS_CHAOS_NODE = join(DIR, "gateway-multi-cmp-ts7-node-chaos.json");
const OUT_DOCS = join(DIR, "index.html");
const OUT_WWW_DIR = join(ROOT, "apps", "www", "public", "benchmarks", "gateway-multi-comparison");
const OUT_WWW_HTML = join(OUT_WWW_DIR, "index.html");
const OUT_WWW_JSON = join(OUT_WWW_DIR, "board.json");
const CANONICAL = "https://clawql.com/benchmarks/gateway-multi-comparison";

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(n, d = 0) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US", {
    maximumFractionDigits: d,
    minimumFractionDigits: d,
  });
}

function armLabel(id) {
  return (
    {
      direct: "Direct HTTP (no MCP)",
      clawql: "ClawQL (Node)",
      clawql_bun: "ClawQL (Bun)",
      executor: "Executor",
      mcpjungle: "MCPJungle",
      agentgateway: "agentgateway",
    }[id] || id
  );
}

function orderArms(board) {
  const prefer = ["direct", "clawql", "clawql_bun", "mcpjungle", "agentgateway", "executor"];
  const ids = Object.keys(board).filter((id) => board[id] && !board[id].skipped);
  return [...prefer.filter((id) => ids.includes(id)), ...ids.filter((id) => !prefer.includes(id))];
}

async function loadJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8"));
}

function buildHtml({ mt, petsNode, petsBun, chaosNode, chaosBun }) {
  const board = mt.board;
  const ratios = mt.ratios_vs_clawql || {};
  const ids = orderArms(board);
  const direct = board.direct;
  const claw = board.clawql;
  const bun = board.clawql_bun;
  const measuredAt = mt.mergedAt || mt.measuredAt;
  const iters = mt.config?.iters ?? 10000;
  const turns = mt.config?.turns ?? 12;

  const tokenRows = ids
    .map((id) => {
      const b = board[id];
      const r = ratios[id] || {};
      const delta = id === "direct" ? 0 : b.combined_at_n - direct.combined_at_n;
      const deltaLabel =
        id === "direct" ? "baseline" : delta < 0 ? `saves ${fmt(-delta)}` : `+${fmt(delta)}`;
      const hl = id.startsWith("clawql") ? ' class="hl"' : "";
      return `<tr${hl}><td>${esc(armLabel(id))}</td><td>${fmt(b.layer1_once_tokens)}</td><td>${fmt(
        b.mean_layer2_tokens,
        1
      )}</td><td><strong>${fmt(b.combined_at_n)}</strong></td><td>${fmt(
        b.mean_result_tokens,
        1
      )}</td><td>${esc(deltaLabel)}</td><td>${b.task_success_ok ? "PASS" : "FAIL"}</td></tr>`;
    })
    .join("\n");

  const costRows = ids
    .map((id) => {
      const b = board[id];
      const fe = b.flow_e2e_ms || {};
      const tl = b.turn_latency_ms || {};
      const latDelta =
        id === "direct" || !direct?.flow_e2e_ms?.p50_ms
          ? "—"
          : `+${fmt(fe.p50_ms - direct.flow_e2e_ms.p50_ms, 1)}`;
      const rss = b.rss_mb_median == null ? "—" : fmt(b.rss_mb_median, 0);
      const hl = id.startsWith("clawql") ? ' class="hl"' : "";
      return `<tr${hl}><td>${esc(armLabel(id))}</td><td>${fmt(fe.p50_ms, 2)} / ${fmt(
        fe.p999_ms,
        2
      )}</td><td>${fmt(tl.p50_ms, 2)} / ${fmt(tl.p999_ms, 2)}</td><td>${esc(
        latDelta
      )}</td><td>${rss}</td></tr>`;
    })
    .join("\n");

  const bunPets =
    petsBun?.board?.clawql_bun && petsNode?.board?.clawql
      ? {
          readyN: petsNode.board.clawql.rss_mb_ready,
          readyB: petsBun.board.clawql_bun.rss_mb_ready,
          loadN: petsNode.board.clawql.rss_mb_median,
          loadB: petsBun.board.clawql_bun.rss_mb_median,
          p50N: petsNode.board.clawql.latency_e2e_ms?.p50_ms,
          p50B: petsBun.board.clawql_bun.latency_e2e_ms?.p50_ms,
          p999N: petsNode.board.clawql.latency_e2e_ms?.p999_ms,
          p999B: petsBun.board.clawql_bun.latency_e2e_ms?.p999_ms,
          costN: petsNode.board.clawql.gateway_cost_ms?.p50_ms,
          costB: petsBun.board.clawql_bun.gateway_cost_ms?.p50_ms,
          chaosN: chaosNode?.board?.clawql,
          chaosB: chaosBun?.board?.clawql_bun,
        }
      : null;

  const saved = claw && direct ? direct.combined_at_n - claw.combined_at_n : null;
  const latTax =
    claw && direct
      ? (claw.flow_e2e_ms.p50_ms - direct.flow_e2e_ms.p50_ms).toFixed(1)
      : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Gateway multi-arm comparison · ClawQL</title>
  <link rel="canonical" href="${CANONICAL}"/>
  <meta name="description" content="Equal-arm MCP gateway board: ClawQL vs MCPJungle, agentgateway, Executor, and a no-gateway direct HTTP baseline — tokens, latency, RSS, and why Bun."/>
  <style>
    :root {
      --ink: #14201c;
      --muted: #4a5c55;
      --line: #d5ddd8;
      --paper: #f7f4ee;
      --card: #fffdf8;
      --accent: #0f6b5c;
      --accent-soft: #d8efe9;
      --warn: #7a4b12;
      --warn-soft: #f3e6d2;
      --hl: #eef7f4;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(1200px 500px at 10% -10%, #e4f2ec 0%, transparent 55%),
        radial-gradient(900px 400px at 100% 0%, #f0e8d8 0%, transparent 50%),
        var(--paper);
      font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
      line-height: 1.55;
    }
    .wrap { max-width: 920px; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
    .meta { color: var(--muted); font-size: 0.92rem; font-family: ui-sans-serif, system-ui, sans-serif; }
    .meta a { color: var(--accent); }
    h1 {
      font-size: clamp(2rem, 4vw, 2.75rem);
      line-height: 1.15;
      margin: 0.35rem 0 0.75rem;
      letter-spacing: -0.02em;
    }
    h2 {
      font-size: 1.35rem;
      margin: 2.25rem 0 0.65rem;
      letter-spacing: -0.01em;
    }
    h3 { font-size: 1.05rem; margin: 1.4rem 0 0.4rem; font-family: ui-sans-serif, system-ui, sans-serif; }
    .lead { font-size: 1.15rem; color: #24352f; max-width: 46rem; }
    a { color: var(--accent); }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.92rem;
      margin: 0.75rem 0 1.1rem;
      background: var(--card);
      border: 1px solid var(--line);
      font-family: ui-sans-serif, system-ui, sans-serif;
    }
    th, td { text-align: left; padding: 0.45rem 0.55rem; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { background: #f1eee6; font-weight: 650; }
    td:nth-child(n+2), th:nth-child(n+2) { text-align: right; font-variant-numeric: tabular-nums; }
    tr.hl td { background: var(--hl); }
    .callout {
      background: var(--accent-soft);
      border: 1px solid #9dcbbe;
      color: #11493f;
      padding: 0.95rem 1.1rem;
      border-radius: 2px;
      margin: 1.1rem 0;
      font-family: ui-sans-serif, system-ui, sans-serif;
    }
    .warn {
      background: var(--warn-soft);
      border: 1px solid #e0c39a;
      color: var(--warn);
      padding: 0.95rem 1.1rem;
      border-radius: 2px;
      margin: 1.1rem 0;
      font-family: ui-sans-serif, system-ui, sans-serif;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.75rem;
      margin: 1rem 0 1.4rem;
      font-family: ui-sans-serif, system-ui, sans-serif;
    }
    .stat {
      background: var(--card);
      border: 1px solid var(--line);
      padding: 0.85rem 0.95rem;
    }
    .stat b { display: block; font-size: 1.35rem; letter-spacing: -0.02em; margin-top: 0.15rem; }
    .stat span { color: var(--muted); font-size: 0.82rem; }
    code, pre {
      background: #efece4;
      border-radius: 2px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.84em;
    }
    code { padding: 0.1rem 0.35rem; }
    pre { padding: 0.9rem 1rem; overflow: auto; border: 1px solid var(--line); }
    ul { padding-left: 1.2rem; }
    .brand { font-family: ui-sans-serif, system-ui, sans-serif; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; font-size: 0.78rem; color: var(--accent); }
  </style>
</head>
<body>
  <div class="wrap">
    <p class="meta"><a href="https://clawql.com/">← clawql.com</a> · <a href="/benchmarks">Benchmarks</a> · <a href="https://pragmaticvectors.com/posts/both-sides-of-context-compression/">Both Sides of Context Compression</a></p>
    <p class="brand">ClawQL</p>
    <h1>Gateway comparison board</h1>
    <p class="lead">Equal-arm 12-step inventory workflow across MCP gateways — plus a <strong>no-gateway direct HTTP</strong> baseline so you can see what each gateway saves in tokens and what it costs in latency and memory.</p>
    <p class="meta">Measured ${esc(measuredAt)} · ${fmt(iters)} flows × ${fmt(turns)} turns/arm · tokenizer <code>cl100k_base</code> · task_success deterministic inventory check</p>

    <div class="grid">
      <div class="stat"><span>ClawQL tokens @12 vs direct</span><b>${saved != null ? `−${fmt(saved)}` : "—"}</b></div>
      <div class="stat"><span>ClawQL flow p50 tax vs direct</span><b>${latTax != null ? `+${esc(latTax)} ms` : "—"}</b></div>
      <div class="stat"><span>Bun multiturn RSS vs Node</span><b>${
        bun && claw ? `${fmt(bun.rss_mb_median, 0)} / ${fmt(claw.rss_mb_median, 0)} MB` : "—"
      }</b></div>
      <div class="stat"><span>Classic token lead vs MCPJungle</span><b>${
        ratios.mcpjungle?.vs_clawql_combined_classic != null
          ? `${ratios.mcpjungle.vs_clawql_combined_classic}×`
          : "—"
      }</b></div>
    </div>

    <div class="callout">
      <strong>Publish line:</strong> most efficient <em>governed</em> gateway — fewest multi-turn I/O tokens with equal task success.
      ClawQL wins tokens by keeping catalog discovery server-side and projecting results (<code>where</code>/<code>fields</code>).
      Direct HTTP is fastest and has no gateway RSS, but returns fat bodies (and no capability/audit path).
    </div>

    <h2>1. Tokens — what the model pays</h2>
    <p>Primary metric: <strong>classic</strong> Layer1 once + Σ Layer2 over 12 turns. Direct has Layer1 = 0 (no MCP <code>tools/list</code>) and fat JSON every turn.</p>
    <table>
      <thead>
        <tr>
          <th>Arm</th><th>L1 once</th><th>Mean L2</th><th>Combined @12</th><th>Mean result</th><th>vs direct</th><th>Success</th>
        </tr>
      </thead>
      <tbody>
${tokenRows}
      </tbody>
    </table>
    <p class="meta">ClawQL / Bun <strong>save</strong> tokens vs raw HTTP because gateway projection shrinks Layer2. Aggregators <strong>add</strong> a fat schema dump (Layer1) on top of the same fat bodies direct already returns. Executor adds the largest Layer2 (full pass-through code result).</p>

    <h2>2. Cost of the gateway — latency &amp; memory</h2>
    <p>Same 10 000 × 12-turn board. Flow e2e = one full 12-step workflow. RSS is gateway process tree under load (direct has no gateway process).</p>
    <table>
      <thead>
        <tr>
          <th>Arm</th><th>Flow e2e p50 / p999 (ms)</th><th>Turn p50 / p999</th><th>p50 tax vs direct</th><th>RSS med (MB)</th>
        </tr>
      </thead>
      <tbody>
${costRows}
      </tbody>
    </table>

    <h3>How to read the trade</h3>
    <ul>
      <li><strong>Direct HTTP</strong> — cheapest latency, zero gateway RSS, fat tokens. No MCP auth/audit/projection.</li>
      <li><strong>ClawQL</strong> — only arm that <em>reduces</em> tokens vs direct (~${saved != null ? fmt(saved) : "—"} @12) while keeping task success. Pays ~${latTax ?? "—"} ms flow p50 and Node RSS.</li>
      <li><strong>MCPJungle / agentgateway</strong> — fast multiplexers; they do <em>not</em> shrink payloads, so they cost schema tokens vs direct for little Layer2 benefit.</li>
      <li><strong>Executor</strong> — smallest Layer1 schema, largest Layer2 (full JSON pass-through); slowest flow p50 here.</li>
    </ul>

    <h2>3. Why move ClawQL from Node to Bun</h2>
    <p>Same <code>dist/server.js</code> and equal-arm env — only the JS runtime binary changes. Tokens are identical; Bun cuts the Node memory/latency tax without a Rust rewrite.</p>
${
  bunPets
    ? `    <table>
      <thead><tr><th>Signal</th><th>Node</th><th>Bun</th><th>Delta</th></tr></thead>
      <tbody>
        <tr><td>Pets Ready RSS</td><td>${fmt(bunPets.readyN, 0)} MB</td><td>${fmt(bunPets.readyB, 0)} MB</td><td>−${fmt(
          ((bunPets.readyN - bunPets.readyB) / bunPets.readyN) * 100,
          0
        )}%</td></tr>
        <tr><td>Pets under-load med RSS</td><td>${fmt(bunPets.loadN, 0)} MB</td><td>${fmt(
          bunPets.loadB,
          0
        )} MB</td><td>−${fmt(((bunPets.loadN - bunPets.loadB) / bunPets.loadN) * 100, 0)}%</td></tr>
        <tr><td>Pets e2e p50 / gateway_cost p50</td><td>${fmt(bunPets.p50N, 2)} / ${fmt(
          bunPets.costN,
          2
        )} ms</td><td>${fmt(bunPets.p50B, 2)} / ${fmt(bunPets.costB, 2)} ms</td><td>faster p50</td></tr>
        <tr><td>Pets e2e p999</td><td>${fmt(bunPets.p999N, 2)} ms</td><td>${fmt(
          bunPets.p999B,
          2
        )} ms</td><td>Node still edges tail</td></tr>
        <tr><td>Multiturn flow p50 / RSS med</td><td>${fmt(claw.flow_e2e_ms.p50_ms, 2)} ms / ${fmt(
          claw.rss_mb_median,
          0
        )} MB</td><td>${fmt(bun.flow_e2e_ms.p50_ms, 2)} ms / ${fmt(
          bun.rss_mb_median,
          0
        )} MB</td><td>Bun wins both</td></tr>
        <tr><td>Chaos until-break</td><td>${
          bunPets.chaosN
            ? `${bunPets.chaosN.chaos_last_ok}/${bunPets.chaosN.chaos_first_break}`
            : "—"
        }</td><td>${
          bunPets.chaosB
            ? `${bunPets.chaosB.chaos_last_ok}/${bunPets.chaosB.chaos_first_break}`
            : "—"
        }</td><td>not a Bun win</td></tr>
      </tbody>
    </table>`
    : "    <p class=\"meta\">Pets Bun boards not found beside this artifact — see repo <code>gateway-multi-cmp-ts7-*-10k.json</code>.</p>"
}
    <div class="warn">
      <strong>Bun is the low-pain lever, not the endgame.</strong>
      It keeps the Effect/TS governed path and buys ~¼ less Ready RSS and much better multiturn RSS/p50.
      It does <em>not</em> reach MCPJungle-class memory or beat Node on every chaos/p999 sample.
      A Rust rewrite would hurt more and might close more of the native gap later — Bun is the optional runtime track now.
    </div>

    <h2>Reproduce</h2>
<pre>EXECUTOR_BIN=… MCPJUNGLE_BIN=/tmp/gw-bins/mcpjungle AGENTGATEWAY_BIN=/tmp/gw-bins/agentgateway \\
  BUN_BIN=~/.bun/bin/bun \\
  MT_TURNS=12 MT_ITERS=10000 CATALOG_TOOL_COUNT=40 \\
  MT_ARMS=direct,clawql,clawql_bun,executor,mcpjungle,agentgateway \\
  MT_OUT=gateway-multi-multiturn-10k.json \\
  npm run benchmark:gateway-multi-multiturn

npm run generate:gateway-multi-page</pre>

    <h2>Raw artifacts</h2>
    <ul>
      <li><a href="./gateway-multi-multiturn-10k.json">gateway-multi-multiturn-10k.json</a> — this board</li>
      <li><a href="./gateway-multi-cmp-ts7-node-10k.json">ts7 Node pets 10k</a> · <a href="./gateway-multi-cmp-ts7-bun-10k.json">ts7 Bun pets 10k</a></li>
      <li><a href="./gateway-multi-cmp-ts7-node-chaos.json">ts7 Node chaos</a> · <a href="./gateway-multi-cmp-ts7-bun-chaos.json">ts7 Bun chaos</a></li>
      <li><a href="./README.md">Methodology README</a></li>
    </ul>

    <h2>What not to claim</h2>
    <ul>
      <li>Do not mix this topology-A stdio/HTTP board with NATS 4-replica concurrency ceilings.</li>
      <li>Do not call a hand-written slim-return program “Executor” — live Executor is full pass-through.</li>
      <li>Do not hide ClawQL RSS — admit the memory loss; Bun shrinks it, Go-thin proxies still win RAM.</li>
      <li>Token wins require <code>task_success</code> — projection must keep the facts the agent needs.</li>
    </ul>
    <p class="meta">Host-bound numbers; re-run on a dedicated bench host before external publish.</p>
  </div>
</body>
</html>
`;
}

async function main() {
  const mt = await loadJson(MT_JSON);
  if (!mt?.board) throw new Error(`missing board in ${MT_JSON}`);
  if (!mt.board.direct) {
    console.warn("warning: board has no `direct` arm — page will omit baseline savings");
  }
  const petsNode = await loadJson(PETS_NODE);
  const petsBun = await loadJson(PETS_BUN);
  const chaosNode = await loadJson(PETS_CHAOS_NODE);
  const chaosBun = await loadJson(PETS_CHAOS_BUN);
  const html = buildHtml({ mt, petsNode, petsBun, chaosNode, chaosBun });
  await writeFile(OUT_DOCS, html);
  await mkdir(OUT_WWW_DIR, { recursive: true });
  await writeFile(OUT_WWW_HTML, html);
  await writeFile(OUT_WWW_JSON, JSON.stringify(mt, null, 2));
  // Copy key JSON siblings for relative links from www public
  for (const name of [
    "gateway-multi-multiturn-10k.json",
    "gateway-multi-cmp-ts7-node-10k.json",
    "gateway-multi-cmp-ts7-bun-10k.json",
    "gateway-multi-cmp-ts7-node-chaos.json",
    "gateway-multi-cmp-ts7-bun-chaos.json",
    "README.md",
  ]) {
    const src = join(DIR, name);
    if (existsSync(src)) await copyFile(src, join(OUT_WWW_DIR, name));
  }
  console.log(`wrote ${OUT_DOCS}`);
  console.log(`wrote ${OUT_WWW_HTML}`);
  console.log(`wrote ${OUT_WWW_JSON}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
