#!/usr/bin/env node
/**
 * Live trace demo: two real Ollama calls → shared JSONL store → flamegraph JSON.
 * Used for screenshots / walkthrough artifacts.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const correlationId = process.env.LIVE_TRACE_CORRELATION_ID?.trim() || `live-demo-${Date.now()}`;
const inferenceUrl = process.env.CLAWQL_INFERENCE_URL?.trim() || "http://127.0.0.1:8787";
const adapterUrl = process.env.MCP_ADAPTER_URL?.trim() || "http://127.0.0.1:18200";
const model = process.env.LIVE_TRACE_MODEL?.trim() || "ollama/tinyllama";

const harness =
  "Harness rules: Prefer ClawQL search then execute. Compress tool JSON in context. Never dump raw OpenAPI.";
const vault =
  "Obsidian vault memory seed: [[MAT-2401]] Escrow 12%, non-compete 24 months, Delaware governing law.";
const toolPayload = JSON.stringify({
  operationId: "memory_recall",
  hits: [
    { title: "MAT-2401", escrow_pct: 12, nc_months: 24, jurisdiction: "DE" },
    { title: "MAT-2401-amend", note: "Escrow holdback reduced from 15% to 12% at close." },
  ],
  truncated: false,
});

async function chat(messages, turn) {
  const res = await fetch(`${inferenceUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Correlation-Id": correlationId,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 80,
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`turn ${turn} HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  const choice = body.choices?.[0]?.message?.content ?? "";
  const usage = body.usage ?? {};
  console.log(`[turn ${turn}] ok — input ${usage.prompt_tokens ?? "?"} output ${usage.completion_tokens ?? "?"} chars ${choice.length}`);
  return choice;
}

async function waitFor(url, label, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`[ready] ${label}`);
        return;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} not ready: ${url}`);
}

await waitFor(`${inferenceUrl}/healthz`, "inference");
await waitFor(`${adapterUrl}/healthz`, "adapter");

console.log(`[live-trace] correlationId=${correlationId}`);

const assistant1 = await chat(
  [
    { role: "system", content: harness },
    { role: "system", content: vault },
    { role: "user", content: "What are the escrow and non-compete terms for MAT-2401?" },
  ],
  1
);

await chat(
  [
    { role: "system", content: harness },
    { role: "system", content: vault },
    { role: "user", content: "What are the escrow and non-compete terms for MAT-2401?" },
    { role: "assistant", content: assistant1 },
    {
      role: "user",
      content: `Tool result from memory_recall:\n${toolPayload}\n\nSummarize for the closing memo in 2 sentences.`,
    },
  ],
  2
);

const traceRes = await fetch(`${adapterUrl}/mcp-ui/trace/${encodeURIComponent(correlationId)}?format=json`);
if (!traceRes.ok) {
  throw new Error(`trace HTTP ${traceRes.status}: ${await traceRes.text()}`);
}
const graph = await traceRes.json();
const outDir = join(tmpdir(), "clawql-live-trace");
await mkdir(outDir, { recursive: true });
const outPath = join(outDir, `${correlationId}.json`);
await import("node:fs/promises").then((fs) =>
  fs.writeFile(outPath, JSON.stringify(graph, null, 2), "utf8")
);

console.log(`[live-trace] graph written ${outPath}`);
console.log(
  JSON.stringify(
    {
      correlationId,
      calls: graph.calls,
      totalInputTokens: graph.totalInputTokens,
      totalOutputTokens: graph.totalOutputTokens,
      bySource: graph.bySource,
      traceHtml: `${adapterUrl}/mcp-ui/trace/${encodeURIComponent(correlationId)}`,
      tokenization: graph.tokenization,
    },
    null,
    2
  )
);
