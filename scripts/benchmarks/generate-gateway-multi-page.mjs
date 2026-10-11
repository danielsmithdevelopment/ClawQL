#!/usr/bin/env node
/**
 * Dedicated gateway multi-arm comparison page (tokens + latency + RSS + Bun).
 *
 *   node scripts/benchmarks/generate-gateway-multi-page.mjs
 *
 * Reads gateway-multi-multiturn-10k.json (+ optional pets Bun boards) and writes:
 *   docs/benchmarks/gateway-multi-comparison/index.html
 *   apps/www/public/benchmarks/gateway-multi-comparison/{index.html,board.json}
 *
 * Token model (rebuildable):
 *   combined = definitions + Σ discovery + Σ results
 * Direct baseline includes catalog tool definitions (agent still needs them
 * without a gateway) + fat HTTP results — aggregators match that surface.
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
const CANONICAL = "https://clawql.com/benchmarks/gateway-multi-comparison/";

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

function vsDirectLabel(id, b, direct) {
  if (id === "direct") return "baseline";
  const delta = b.combined_at_n - direct.combined_at_n;
  if (Math.abs(delta) < 50) return "matches baseline";
  if (delta < 0) return `saves ${fmt(-delta)}`;
  return `+${fmt(delta)}`;
}

function buildHtml({ mt, petsNode, petsBun, chaosNode, chaosBun }) {
  const board = mt.board;
  const ratios = mt.ratios_vs_clawql || {};
  const ids = orderArms(board);
  const direct = board.direct;
  const claw = board.clawql;
  const bun = board.clawql_bun;
  const measuredAt = mt.correctedAt || mt.mergedAt || mt.measuredAt;
  const iters = mt.config?.iters ?? 10000;
  const turns = mt.config?.turns ?? 12;
  const saved = claw && direct ? direct.combined_at_n - claw.combined_at_n : null;
  const latTax =
    claw && direct?.flow_e2e_ms?.p50_ms != null
      ? (claw.flow_e2e_ms.p50_ms - direct.flow_e2e_ms.p50_ms).toFixed(1)
      : null;

  const breakdownRows = ids
    .map((id) => {
      const b = board[id];
      const defs = b.definitions_tokens ?? b.layer1_once_tokens;
      const disc = b.discovery_tokens_sum ?? 0;
      const res = b.result_tokens_sum ?? Math.round((b.mean_result_tokens || 0) * turns);
      const rebuild = b.combined_rebuild ?? defs + disc + res;
      const ok = rebuild === b.combined_at_n ? "✓" : "≠";
      const hl = id.startsWith("clawql") ? ' class="hl"' : "";
      return `<tr${hl}><td>${esc(armLabel(id))}</td><td>${fmt(defs)}</td><td>${fmt(
        disc
      )}</td><td>${fmt(res)}</td><td><strong>${fmt(b.combined_at_n)}</strong></td><td>${esc(
        vsDirectLabel(id, b, direct)
      )}</td><td>${ok}</td></tr>`;
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Gateway multi-arm comparison · ClawQL</title>
  <link rel="canonical" href="${CANONICAL}"/>
  <meta name="description" content="Equal-arm MCP gateway board: ClawQL vs MCPJungle, agentgateway, Executor, and a no-gateway direct HTTP baseline with catalog definitions — tokens, latency, RSS, and why Bun."/>
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
    .wrap { max-width: 960px; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
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
    .lead { font-size: 1.15rem; color: #24352f; max-width: 48rem; }
    a { color: var(--accent); }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
      margin: 0.75rem 0 1.1rem;
      background: var(--card);
      border: 1px solid var(--line);
      font-family: ui-sans-serif, system-ui, sans-serif;
    }
    th, td { text-align: left; padding: 0.45rem 0.5rem; border-bottom: 1px solid var(--line); vertical-align: top; }
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
    .eq { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.88rem; background: var(--card); border: 1px solid var(--line); padding: 0.75rem 1rem; }
  </style>
</head>
<body>
  <div class="wrap">
    <p class="meta"><a href="https://clawql.com/">← clawql.com</a> · <a href="/benchmarks/">Benchmarks</a> · <a href="https://docs.clawql.com/benchmarks/gateway-multi-comparison">docs mirror</a></p>
    <p class="brand">ClawQL</p>
    <h1>Gateway comparison board</h1>
    <p class="lead">Equal-arm 12-step inventory workflow across MCP gateways — plus a <strong>no-gateway direct HTTP</strong> baseline that still counts <em>catalog tool definitions</em> (an agent calling 40 ops without a gateway still needs them).</p>
    <p class="meta">Measured ${esc(measuredAt)} · ${fmt(iters)} flows × ${fmt(turns)} turns/arm · tokenizer <code>cl100k_base</code> · task_success deterministic</p>

    <div class="warn">
      <strong>Deploy status:</strong> this HTML ships in <code>apps/www/public/benchmarks/gateway-multi-comparison/</code>.
      <code>https://clawql.com/benchmarks/gateway-multi-comparison/</code> stays 404 until the www GitHub Pages deploy that includes this branch merges.
      Prefer the trailing-slash URL (Next <code>trailingSlash: true</code>). Docs path: <code>docs.clawql.com/benchmarks/gateway-multi-comparison</code> after docs deploy.
    </div>

    <div class="grid">
      <div class="stat"><span>ClawQL tokens @12 vs direct</span><b>${saved != null ? `−${fmt(saved)}` : "—"}</b></div>
      <div class="stat"><span>ClawQL flow p50 tax vs direct</span><b>${latTax != null ? `+${esc(latTax)} ms` : "—"}</b></div>
      <div class="stat"><span>Bun multiturn RSS vs Node</span><b>${
        bun && claw ? `${fmt(bun.rss_mb_median, 0)} / ${fmt(claw.rss_mb_median, 0)} MB` : "—"
      }</b></div>
      <div class="stat"><span>agentgateway vs direct tokens</span><b>match</b></div>
    </div>

    <div class="callout">
      <strong>Publish line:</strong> most efficient <em>governed</em> gateway — fewest multi-turn I/O tokens with equal task success.
      ClawQL wins by keeping catalog discovery server-side (<code>search</code>) and projecting results (<code>where</code>/<code>fields</code>).
      Thin aggregators <strong>match</strong> a fair no-gateway baseline (definitions + fat bodies); they do not invent an extra “schema tax” beyond what any agent needs.
    </div>

    <h2>1. Tokens — rebuild every total</h2>
    <p class="eq">combined @12 = <strong>definitions</strong> + <strong>Σ discovery</strong> + <strong>Σ results</strong></p>
    <ul>
      <li><strong>Definitions</strong> — tool/OpenAPI schemas once (classic Layer1). The baseline pins these to <strong>agentgateway’s <code>tools/list</code> serialization</strong> of the same 40 catalog ops (unwrapped republish) — that is why agentgateway matches the baseline exactly.</li>
      <li><strong>Discovery</strong> — per-turn search/hit text (ClawQL only; 0 for others).</li>
      <li><strong>Results</strong> — tool/HTTP response tokens across 12 turns.</li>
    </ul>
    <table>
      <thead>
        <tr>
          <th>Arm</th>
          <th>Definitions</th>
          <th>Σ Discovery</th>
          <th>Σ Results</th>
          <th>Combined @12</th>
          <th>vs direct</th>
          <th>Σ=?</th>
        </tr>
      </thead>
      <tbody>
${breakdownRows}
      </tbody>
    </table>
    <p class="meta">
      ClawQL check: ${fmt(claw?.definitions_tokens)} + ${fmt(claw?.discovery_tokens_sum)} + ${fmt(
        claw?.result_tokens_sum
      )} = <strong>${fmt(claw?.combined_at_n)}</strong>
      (mean discovery ${fmt(claw?.mean_discovery_tokens, 1)}/turn · mean result ${fmt(
        claw?.mean_result_tokens,
        1
      )}/turn).
      Direct = ${fmt(direct?.definitions_tokens)} defs (agentgateway serialization) + ${fmt(
        direct?.result_tokens_sum
      )} fat results = <strong>${fmt(direct?.combined_at_n)}</strong>.
      agentgateway matches that total by construction; MCPJungle’s +${fmt(
        (board.mcpjungle?.combined_at_n || 0) - (direct?.combined_at_n || 0)
      )} is exactly its defs (${fmt(board.mcpjungle?.definitions_tokens)}) minus baseline defs (${fmt(
        direct?.definitions_tokens
      )}) — slightly more verbose wrapped schema text, not another token kind.
    </p>

    <h3>Where ClawQL’s next token win is</h3>
    <p>
      Discovery is <strong>${fmt(claw?.discovery_tokens_sum)}</strong> tokens —
      ${
        claw?.combined_at_n
          ? `${Math.round((100 * claw.discovery_tokens_sum) / claw.combined_at_n)}%`
          : "—"
      } of ClawQL’s combined total — about ${fmt(
        claw?.mean_discovery_tokens,
        0
      )} search tokens/turn, larger than projected tool results (~${fmt(
        claw?.mean_result_tokens,
        0
      )}/turn). Projection already won Layer2; discovery is the next lever (no change to functionality):
    </p>
    <ul>
      <li><strong>Leaner search results</strong> — return compact typed signatures for top matches, not fuller entries. ~300 tok/turn (vs ~964) would cut ~8 000 from the 12-turn total.</li>
      <li><strong>Skip search when the agent already knows the operation</strong> — allow <code>execute</code> by operation ID directly when the same ops recur across turns, and measure how often the flow repeats operations.</li>
    </ul>

    <h2>2. Cost of the gateway — latency &amp; memory</h2>
    <p>Same 10 000 × 12-turn board. Flow e2e = one full 12-step workflow. Direct has no gateway process RSS (definitions are counted for tokens only).</p>
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
      <li><strong>Direct HTTP</strong> — lowest latency, no gateway RSS; tokens = catalog definitions + fat bodies (fair agent baseline).</li>
      <li><strong>agentgateway / MCPJungle</strong> — match (or nearly match) that token total; fast multiplexers; they do <em>not</em> shrink Layer2.</li>
      <li><strong>ClawQL</strong> — only arm that <em>reduces</em> tokens vs the fair baseline (~${
        saved != null ? fmt(saved) : "—"
      } @12) via projection; pays discovery tokens + ~${latTax ?? "—"} ms flow p50 and RSS.</li>
      <li><strong>Executor</strong> — tiny definitions, largest results (full pass-through); slowest flow p50 here.</li>
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
    : "    <p class=\"meta\">Pets Bun boards not found beside this artifact.</p>"
}
    <div class="warn">
      <strong>Bun is the low-pain lever, not the endgame.</strong>
      It keeps the Effect/TS governed path and buys ~¼ less Ready RSS and much better multiturn RSS/p50.
      It does <em>not</em> reach MCPJungle-class memory or beat Node on every chaos/p999 sample.
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
      <li><a href="./gateway-multi-multiturn-10k.json">gateway-multi-multiturn-10k.json</a></li>
      <li><a href="./gateway-multi-cmp-ts7-node-10k.json">ts7 Node pets 10k</a> · <a href="./gateway-multi-cmp-ts7-bun-10k.json">ts7 Bun pets 10k</a></li>
      <li><a href="./README.md">Methodology README</a></li>
    </ul>

    <h2>What not to claim</h2>
    <ul>
      <li>Do not say aggregators add a “schema tax” vs a zero-definition baseline — that baseline was unfair.</li>
      <li>Do not link <code>clawql.com/benchmarks/…</code> until www Pages deploy includes this folder.</li>
      <li>Do not mix topology-A ceilings with NATS 4-replica concurrency.</li>
      <li>Do not hide ClawQL RSS; Bun shrinks it, Go-thin proxies still win RAM.</li>
      <li>Token wins require <code>task_success</code>.</li>
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
  if (!mt.board.direct) throw new Error("board missing direct arm");
  if (!(mt.board.direct.definitions_tokens > 0)) {
    throw new Error(
      "direct.definitions_tokens must be > 0 (catalog definitions). Re-measure or patch board JSON."
    );
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
  console.log(
    `direct=${mt.board.direct.combined_at_n} clawql_saved=${
      mt.board.direct.combined_at_n - mt.board.clawql.combined_at_n
    }`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
