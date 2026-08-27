#!/usr/bin/env node
/**
 * executor-cmp-002b: uniform-fat multiturn (pulls.list pages 1..N)
 * Matches the napkin assumption: each action similarly verbose.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getEncoding } from "js-tiktoken";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "docs", "benchmarks", "executor-comparison");
const SINGLE_LIVE = join(OUT_DIR, "executor-cmp-001.live.json");
const BIN = process.env.EXECUTOR_BIN?.trim();
const CWD = process.env.EXECUTOR_CWD?.trim() || (BIN ? dirname(BIN) : "");
const TURNS = Math.min(10, Math.max(1, Number(process.env.CMP_TURNS ?? "5") || 5));
const PER_PAGE = 30;

if (!BIN) {
  console.error("EXECUTOR_BIN required");
  process.exit(1);
}

const enc = getEncoding("cl100k_base");
const count = (t) => enc.encode(String(t)).length;

function executorPulls(page) {
  const args = JSON.stringify({
    owner: "vercel",
    repo: "next.js",
    state: "open",
    per_page: PER_PAGE,
    page,
  });
  const outPath = `/tmp/ex-uniform-page-${page}.json`;
  const errPath = `/tmp/ex-uniform-page-${page}.err`;
  // File redirect via shell — Node pipe buffers truncate ~300KB Executor payloads.
  const quotedArgs = JSON.stringify(args);
  const result = spawnSync(
    "bash",
    [
      "-lc",
      `"${BIN}" call github.user.githubMain.pulls.list ${quotedArgs} > "${outPath}" 2> "${errPath}"`,
    ],
    { cwd: CWD, encoding: "utf-8", timeout: 180_000 }
  );
  if (result.status !== 0) {
    let err = "";
    try {
      err = fs.readFileSync(errPath, "utf-8");
    } catch {
      err = result.stderr || `exit ${result.status}`;
    }
    // still try parse stdout file if present
  }
  const raw = fs.readFileSync(outPath, "utf-8");
  if (!raw.trim()) {
    throw new Error(fs.readFileSync(errPath, "utf-8") || "empty Executor output");
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const parsed = JSON.parse(raw.slice(start, end + 1));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
  const text = JSON.stringify(parsed.data);
  return { tokens: count(text), items: parsed.data.length };
}

async function main() {
  const live = JSON.parse(await readFile(SINGLE_LIVE, "utf-8"));
  const execL1 = live.layer1.executorLiveMcp.executeOnlyTokens;
  const clawL1 = live.layer1.clawqlMeasured.gatewayCodemodeOnly.codemodeOnlyTokens;

  const home = join("/tmp", `clawql-uniform-${process.pid}`);
  await mkdir(home, { recursive: true });
  const token = spawnSync("gh", ["auth", "token"], { encoding: "utf-8" }).stdout.trim();
  const env = {
    ...process.env,
    CLAWQL_PROVIDER: "github",
    CLAWQL_BUNDLED_OFFLINE: "1",
    CLAWQL_HOME: home,
    CLAWQL_OBSIDIAN_VAULT_PATH: home,
    CLAWQL_TIER: "",
    CLAWQL_INSTANCE_SPEC: "",
    CLAWQL_INSTANCE_SPEC_FILE: "",
    CLAWQL_ENABLE_MEMORY: "0",
    CLAWQL_ENABLE_DOCUMENTS: "0",
    CLAWQL_ENABLE_PAGEINDEX: "0",
    CLAWQL_BEARER_TOKEN: token,
    GITHUB_TOKEN: token,
  };
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, "dist", "server.js")],
    cwd: ROOT,
    stderr: "pipe",
    env,
  });
  const client = new Client({ name: "uniform", version: "1" }, {});
  await client.connect(transport);

  const turns = [];
  try {
    for (let page = 1; page <= TURNS; page++) {
      const ex = executorPulls(page);
      const cq = await client.callTool({
        name: "execute",
        arguments: {
          operationId: "pulls/list",
          args: {
            owner: "vercel",
            repo: "next.js",
            state: "open",
            per_page: PER_PAGE,
            page,
          },
          fields: ["title", "number"],
        },
      });
      const text = cq.content?.find((c) => c.type === "text")?.text ?? "";
      const cqTok = count(text);
      let items = 0;
      try {
        items = JSON.parse(text).length;
      } catch {
        /* ignore */
      }
      console.error(`page ${page}: Exec ${ex.tokens} (${ex.items}) | ClawQL ${cqTok} (${items})`);
      turns.push({
        page,
        executor: ex.tokens,
        clawql: cqTok,
        executorItems: ex.items,
        clawqlItems: items,
      });
    }
  } finally {
    await client.close().catch(() => {});
  }

  let e2 = 0;
  let c2 = 0;
  const ratios = turns.map((t, i) => {
    e2 += t.executor;
    c2 += t.clawql;
    const ec = execL1 + e2;
    const cc = clawL1 + c2;
    return {
      n: i + 1,
      executorCombined: ec,
      clawqlCombined: cc,
      ratio: +(ec / cc).toFixed(2),
      executorLayer2SharePct: +((100 * e2) / ec).toFixed(1),
    };
  });

  const report = {
    task: {
      id: "executor-cmp-002b",
      description:
        "Uniform-fat measured: pulls.list pages 1..N — napkin assumption (similarly verbose each turn)",
      repo: "vercel/next.js",
      turns: TURNS,
    },
    layer1Once: { executorLiveExecuteOnly: execL1, clawqlCodemode: clawL1 },
    perTurnLayer2: turns,
    cumulative: {
      ratios,
      layer2MeanRatioAsymptote: +(
        turns.reduce((s, t) => s + t.executor, 0) /
        Math.max(1, turns.reduce((s, t) => s + t.clawql, 0))
      ).toFixed(2),
    },
    generatedAt: new Date().toISOString(),
  };

  await mkdir(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, "executor-cmp-002b.uniform-pulls.live.json");
  await writeFile(path, JSON.stringify(report, null, 2));
  console.log("\nn | Executor | ClawQL | ratio | Exec L2%");
  for (const r of ratios) {
    console.log(
      `${r.n} | ${r.executorCombined.toLocaleString()} | ${r.clawqlCombined.toLocaleString()} | ${r.ratio}× | ${r.executorLayer2SharePct}%`
    );
  }
  console.log(`asymptote ${report.cumulative.layer2MeanRatioAsymptote}×`);
  console.error(`Wrote ${path}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
