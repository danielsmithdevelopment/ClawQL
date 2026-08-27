#!/usr/bin/env node
/**
 * Live compressed vs fat compare — two real inference sessions, side-by-side slide.
 *
 * Prerequisites: Ollama + tinyllama, clawql-inference :8787, mcp-api-adapter :18200
 * with MCP_API_ADAPTER_INFERENCE_TRACE=1 and shared JSONL store.
 */
const inferenceUrl = process.env.CLAWQL_INFERENCE_URL?.trim() || "http://127.0.0.1:8787";
const adapterUrl = process.env.MCP_ADAPTER_URL?.trim() || "http://127.0.0.1:18200";
const model = process.env.LIVE_TRACE_MODEL?.trim() || "ollama/tinyllama";
const stamp = Date.now();
const compressedId = process.env.LIVE_COMPARE_COMPRESSED?.trim() || `live-cmp-${stamp}-compressed`;
const fatId = process.env.LIVE_COMPARE_FAT?.trim() || `live-cmp-${stamp}-fat`;

const harness =
  "You are ClawQL harness. Prefer search() then execute(). Keep tool results compact in context.";
const vault =
  "Obsidian vault system-seed memory: [[MCP UI Live Compare]] agent.md notes for this session.";
const userTask = "List GitHub repos then summarize the first one.";
const toolSchema =
  '{"name":"search","inputSchema":{"type":"object","properties":{"query":{"type":"string"}}}}';

function compressedSearchResult() {
  return JSON.stringify({
    results: [{ id: "repos.list", method: "GET", path: "/user/repos", score: 12 }],
  });
}

function fatSearchResult() {
  const chunk = "x".repeat(320);
  const desc = "Untrimmed OpenAPI dump ".repeat(16);
  const results = Array.from({ length: 18 }, (_, i) => ({
    id: `repos.list.${i}`,
    method: "GET",
    path: "/user/repos",
    full: chunk,
    description: desc,
  }));
  return JSON.stringify({ results });
}

const turn1Base = [
  { role: "system", content: harness },
  { role: "system", content: vault },
  { role: "user", content: userTask },
  { role: "user", content: toolSchema },
];

async function chat(correlationId, messages, turn) {
  const res = await fetch(`${inferenceUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Correlation-Id": correlationId,
    },
    body: JSON.stringify({ model, messages, max_tokens: 48 }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`${correlationId} turn ${turn}: HTTP ${res.status} ${JSON.stringify(body)}`);
  }
  const choice = body.choices?.[0]?.message?.content ?? "";
  const usage = body.usage ?? {};
  console.log(
    `[${correlationId} turn ${turn}] in ${usage.prompt_tokens ?? "?"} out ${usage.completion_tokens ?? "?"}`
  );
  return choice;
}

async function runScenario(correlationId, toolTurn1, toolTurn2) {
  await chat(
    correlationId,
    [...turn1Base, { role: "tool", content: toolTurn1 }],
    1
  );
  const assistant = "First repo looks active; next hop is execute(repos.get).";
  await chat(
    correlationId,
    [
      ...turn1Base,
      { role: "tool", content: toolTurn1 },
      { role: "assistant", content: assistant },
      { role: "tool", content: toolTurn2 },
      { role: "user", content: "Summarize the first repo in one sentence." },
    ],
    2
  );
}

async function waitFor(url, label) {
  for (let i = 0; i < 30; i++) {
    try {
      if ((await fetch(url)).ok) {
        console.log(`[ready] ${label}`);
        return;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} not ready`);
}

await waitFor(`${inferenceUrl}/healthz`, "inference");
await waitFor(`${adapterUrl}/healthz`, "adapter");

console.log(`[live-compare] compressed=${compressedId}`);
console.log(`[live-compare] fat=${fatId}`);

await runScenario(compressedId, compressedSearchResult(), compressedSearchResult());
await runScenario(fatId, fatSearchResult(), fatSearchResult());

const compareUrl = `${adapterUrl}/mcp-ui/trace/compare?left=${encodeURIComponent(compressedId)}&right=${encodeURIComponent(fatId)}`;
const compareRes = await fetch(`${compareUrl}&format=json`);
if (!compareRes.ok) {
  throw new Error(`compare HTTP ${compareRes.status}: ${await compareRes.text()}`);
}
const data = await compareRes.json();
const cTotal = data.compressed.totalInputTokens + data.compressed.totalOutputTokens;
const fTotal = data.fat.totalInputTokens + data.fat.totalOutputTokens;
const ratio = cTotal > 0 ? (fTotal / cTotal).toFixed(1) : "?";
const fToolPct = Math.round(
  ((data.fat.bySource.tool_result ?? 0) / Math.max(1, fTotal)) * 100
);

console.log(
  JSON.stringify(
    {
      compressedId,
      fatId,
      compareHtml: compareUrl,
      ratio,
      compressedTotal: cTotal,
      fatTotal: fTotal,
      fatToolResultPct: fToolPct,
      compressedBySource: data.compressed.bySource,
      fatBySource: data.fat.bySource,
    },
    null,
    2
  )
);
