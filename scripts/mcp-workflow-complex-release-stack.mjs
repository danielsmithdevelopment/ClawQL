#!/usr/bin/env node
/**
 * Complex release-stack workflow via **real MCP** (`search` + optional `execute`),
 * matching the scenario in `workflow-complex-release-stack.mjs`.
 *
 * Transports:
 *   - **stdio** (default): spawns `node dist/server.js` with CLAWQL_PROVIDER=all-providers
 *   - **Streamable HTTP**: set `CLAWQL_MCP_URL` (e.g. http://127.0.0.1:8080/mcp) — server must
 *     already run with the same merged preset (all-providers), not e.g. google-top50 only.
 *
 * Usage (dry run — **`search` only**, no upstream HTTP):
 *   npm run build && npm run workflow:complex-release-stack:mcp
 *
 *   CLAWQL_MCP_URL=http://127.0.0.1:8080/mcp npm run workflow:complex-release-stack:mcp
 *
 * Live `execute` smoke (placeholder args → expect 401/404 without real auth — opt-in):
 *   WORKFLOW_MCP_EXECUTE=1 npm run workflow:complex-release-stack:mcp
 *
 * Env:
 *   WORKFLOW_MCP_EXECUTE=1   — also call `execute` (default: off = dry run)
 *   WORKFLOW_MCP_EXECUTE_EACH_QUERY=1 — when execute is on: run for every query hit (default: one execute per step)
 *   WORKFLOW_MCP_SEARCH_LIMIT=35 — wide pass: max results (1–50) when quick pass has no vendor-scoped hit
 *   WORKFLOW_MCP_SEARCH_LIMIT_QUICK=10 — first pass cap (≤ wide); set equal to wide to use a single search only
 *   WORKFLOW_MCP_HEALTH_WAIT_SEC=180 — when using CLAWQL_MCP_URL: poll /healthz until ready (K8s/Docker cold start loads many specs)
 *   WORKFLOW_MCP_HEALTH_QUIET=1 — suppress wait progress on stderr
 */

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { COMPLEX_RELEASE_STACK_WORKFLOW as WORKFLOW } from "./complex-release-stack-steps.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function serializeMcpToolResult(result) {
  return {
    isError: result.isError ?? false,
    structuredContent: result.structuredContent ?? null,
    content: (result.content ?? []).map((block) => {
      if (block.type === "text") {
        return { type: "text", text: block.text };
      }
      return block;
    }),
  };
}

function parseSearchResultsFromMcpCall(mcpCallToolResult) {
  const textBlocks = (mcpCallToolResult?.content ?? []).filter(
    (b) => b.type === "text"
  );
  for (const block of textBlocks) {
    try {
      const parsed = JSON.parse(block.text);
      if (parsed && Array.isArray(parsed.results)) return parsed.results;
    } catch {
      // Ignore non-JSON text blocks.
    }
  }
  return [];
}

function firstTextJsonObject(mcpCallToolResult) {
  const textBlocks = (mcpCallToolResult?.content ?? []).filter(
    (b) => b.type === "text"
  );
  for (const block of textBlocks) {
    try {
      return JSON.parse(block.text);
    } catch {
      /* continue */
    }
  }
  return null;
}

/** Same logical split as `operationsForLogicalProvider` in workflow-complex-release-stack.mjs */
function hitMatchesLogicalProvider(hit, logicalProvider, vendorLabelSet) {
  const label = hit.specLabel ?? null;
  if (logicalProvider === "google") {
    return label == null || !vendorLabelSet.has(label);
  }
  return label === logicalProvider;
}

function pickHitForStep(hits, logicalProvider, vendorLabelSet) {
  return (
    hits.find((h) => hitMatchesLogicalProvider(h, logicalProvider, vendorLabelSet)) ??
    null
  );
}

const MCP_SEARCH_HARD_CAP = 50;

/**
 * Search merged ops, then take the first hit whose specLabel matches the step provider (or Google heuristic).
 * Two RPCs when the quick window has no vendor-scoped match: keeps common cases fast, ambiguous queries get a wider pool to filter.
 */
async function mcpSearchWithProviderPick(
  query,
  logicalProvider,
  vendorLabelSet,
  mcpSearch,
  quickLimit,
  wideLimit
) {
  const run = async (limit) => {
    const mcpCallToolResult = await mcpSearch(query, limit);
    const hits = parseSearchResultsFromMcpCall(mcpCallToolResult);
    const match = pickHitForStep(hits, logicalProvider, vendorLabelSet);
    return { mcpCallToolResult, hits, match, limit };
  };

  const first = await run(quickLimit);
  if (first.match || wideLimit <= quickLimit) {
    return {
      ...first,
      searchWidened: false,
      limitsAttempted: [first.limit],
    };
  }

  const second = await run(wideLimit);
  return {
    mcpCallToolResult: second.mcpCallToolResult,
    hits: second.hits,
    match: second.match,
    limit: second.limit,
    searchWidened: true,
    limitsAttempted: [quickLimit, wideLimit],
  };
}

function buildPlaceholderArgs(hit) {
  const args = {};
  for (const p of hit.parameters ?? []) {
    if (
      p.required &&
      (p.location === "path" || p.location === "query")
    ) {
      args[p.name] = "clawql-benchmark-placeholder";
    }
  }
  return args;
}

function mcpHealthzUrl(mcpUrlString) {
  const u = new URL(mcpUrlString);
  u.pathname = "/healthz";
  u.search = "";
  u.hash = "";
  return u.toString();
}

async function waitForMcpHttpReady(mcpUrlString) {
  const healthUrl = mcpHealthzUrl(mcpUrlString);
  const maxSec = Number.parseInt(
    process.env.WORKFLOW_MCP_HEALTH_WAIT_SEC ?? "180",
    10
  );
  const quiet = process.env.WORKFLOW_MCP_HEALTH_QUIET === "1";
  const start = Date.now();
  let lastErrMsg = "—";
  let lastProgressLog = 0;
  if (!quiet) {
    console.error(
      `[mcp-workflow] Waiting for MCP HTTP: ${healthUrl} (max ${maxSec}s; loading specs on first start can take ~1–2 min)`
    );
  }
  while ((Date.now() - start) / 1000 < maxSec) {
    try {
      const res = await fetch(healthUrl, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const j = await res.json().catch(() => null);
        if (j?.status === "ok") {
          if (!quiet) {
            const elapsed = Math.round((Date.now() - start) / 1000);
            console.error(
              `[mcp-workflow] MCP HTTP is up (${elapsed}s) — connecting to ${mcpUrlString}`
            );
          }
          return;
        }
      }
      lastErrMsg = `HTTP ${res.status}`;
    } catch (e) {
      lastErrMsg = e instanceof Error ? e.message : String(e);
    }
    const now = Date.now();
    if (!quiet && now - lastProgressLog >= 8000) {
      lastProgressLog = now;
      const elapsed = Math.floor((now - start) / 1000);
      console.error(
        `[mcp-workflow] Still waiting… ${elapsed}s / ${maxSec}s — ${lastErrMsg}`
      );
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(
    `Timed out after ${maxSec}s waiting for MCP HTTP at ${healthUrl} (last: ${lastErrMsg}). ` +
      `The server only listens after loading bundled specs; on Kubernetes wait until the pod is Ready or: curl ${healthUrl}`
  );
}

async function createTransportAndClient() {
  const serverLogs = [];
  const url = process.env.CLAWQL_MCP_URL?.trim();

  if (url) {
    await waitForMcpHttpReady(url);
    const { StreamableHTTPClientTransport } = await import(
      "@modelcontextprotocol/sdk/client/streamableHttp.js"
    );
    const transport = new StreamableHTTPClientTransport(new URL(url));
    const client = new Client(
      { name: "clawql-complex-release-mcp-workflow", version: "1.0.0" },
      {}
    );
    await client.connect(transport);
    return { client, transport, serverLogs, mode: "streamable-http", url };
  }

  const childEnv = { ...process.env };
  childEnv.CLAWQL_PROVIDER = "all-providers";
  childEnv.CLAWQL_BUNDLED_OFFLINE = childEnv.CLAWQL_BUNDLED_OFFLINE ?? "1";
  delete childEnv.CLAWQL_GOOGLE_TOP50_SPECS;
  delete childEnv.CLAWQL_SPEC_PATH;
  delete childEnv.CLAWQL_SPEC_PATHS;
  delete childEnv.CLAWQL_DISCOVERY_URL;

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, "dist", "server.js")],
    cwd: ROOT,
    stderr: "pipe",
    env: childEnv,
  });

  if (transport.stderr) {
    transport.stderr.on("data", (chunk) => {
      serverLogs.push(chunk.toString());
    });
  }

  const client = new Client(
    { name: "clawql-complex-release-mcp-workflow", version: "1.0.0" },
    {}
  );

  await client.connect(transport);
  return { client, transport, serverLogs, mode: "stdio", url: null };
}

async function main() {
  /** Dry run by default: only MCP `search`. Set WORKFLOW_MCP_EXECUTE=1 for placeholder `execute` calls. */
  const doExecute = process.env.WORKFLOW_MCP_EXECUTE === "1";
  const executeEachQuery = process.env.WORKFLOW_MCP_EXECUTE_EACH_QUERY === "1";
  const searchLimitWide = Math.min(
    MCP_SEARCH_HARD_CAP,
    Math.max(5, Number.parseInt(process.env.WORKFLOW_MCP_SEARCH_LIMIT ?? "35", 10) || 35)
  );
  const searchLimitQuick = Math.min(
    searchLimitWide,
    Math.max(1, Number.parseInt(process.env.WORKFLOW_MCP_SEARCH_LIMIT_QUICK ?? "10", 10) || 10)
  );

  const { BUNDLED_MERGED_VENDOR_LABELS } = await import(
    join(ROOT, "dist", "provider-registry.js")
  );
  const vendorLabelSet = new Set(BUNDLED_MERGED_VENDOR_LABELS);

  const { client, transport, serverLogs, mode, url } = await createTransportAndClient();

  try {
    async function mcpSearch(query, limit) {
      const result = await client.callTool({
        name: "search",
        arguments: { query, limit },
      });
      return serializeMcpToolResult(result);
    }

    async function mcpExecute(operationId, args) {
      const result = await client.callTool({
        name: "execute",
        arguments: { operationId, args },
      });
      return serializeMcpToolResult(result);
    }

    const stepsOut = [];

    for (const step of WORKFLOW) {
      const queriesOut = [];
      let executedThisStep = false;

      for (const query of step.queries) {
        const picked = await mcpSearchWithProviderPick(
          query,
          step.provider,
          vendorLabelSet,
          mcpSearch,
          searchLimitQuick,
          searchLimitWide
        );
        const { mcpCallToolResult, hits, match } = picked;
        const entry = {
          query,
          hitCount: hits.length,
          searchLimitUsed: picked.limit,
          searchWidened: picked.searchWidened,
          searchLimitsAttempted: picked.limitsAttempted,
          mcpSearch: mcpCallToolResult,
          matchedHit: match
            ? {
                id: match.id,
                method: match.method,
                path: match.path,
                score: match.score,
                specLabel: match.specLabel ?? null,
              }
            : null,
          execute: null,
        };

        const shouldRunExecute =
          doExecute &&
          match &&
          (executeEachQuery || !executedThisStep);
        if (shouldRunExecute) {
          const args = buildPlaceholderArgs(match);
          entry.execute = await mcpExecute(match.id, args);
          entry.executeSummary = summarizeExecute(entry.execute, match.id);
          if (!executeEachQuery) executedThisStep = true;
        }

        queriesOut.push(entry);
      }

      stepsOut.push({
        provider: step.provider,
        title: step.title,
        queries: queriesOut,
      });
    }

    await client.close();

    if (transport?.terminateSession) {
      try {
        await transport.terminateSession();
      } catch {
        /* server may return 405 */
      }
    }

    let stderrJoined = serverLogs.join("");
    const mergedOperationCountMatch = stderrJoined.match(
      /Multi-spec: \d+ APIs merged → (\d+) operations/
    );
    const mergedOperationCount = mergedOperationCountMatch
      ? Number(mergedOperationCountMatch[1])
      : null;
    stderrJoined = stderrJoined.split(ROOT).join("<CLAWQL_ROOT>");

    const out = {
      meta: {
        generatedAt: new Date().toISOString(),
        transport: mode,
        mcpUrl: url,
        clientInfo: { name: "clawql-complex-release-mcp-workflow", version: "1.0.0" },
        clawqlProviderPreset: "all-providers",
        dryRun: !doExecute,
        executeEnabled: doExecute,
        executeEachQuery,
        searchLimitQuick,
        searchLimitWide,
        mergedOperationCount,
        serverStderrTail: mode === "stdio" ? stderrJoined.slice(-12000) : null,
        note:
          (doExecute
            ? "execute calls use placeholder args — expect 401/404/etc. without real credentials."
            : "Dry run: only search tools/call. No execute; no upstream REST.") +
          " Each queries[].mcpSearch is the raw search response.",
      },
      steps: stepsOut,
    };

    const dest = join(ROOT, "docs", "workflow-complex-release-stack-mcp-latest.json");
    await writeFile(dest, JSON.stringify(out, null, 2), "utf-8");

    printConsoleSummary(out, dest);

    console.error(`\n[mcp-workflow-complex-release-stack] Wrote ${dest}`);
  } catch (e) {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
    throw e;
  }
}

function summarizeExecute(mcpCallToolResult, operationId) {
  const body = firstTextJsonObject(mcpCallToolResult);
  if (body?.error) {
    return {
      ok: false,
      operationId,
      error: typeof body.error === "string" ? body.error : JSON.stringify(body.error),
    };
  }
  const text =
    (mcpCallToolResult?.content ?? []).find((b) => b.type === "text")?.text ?? "";
  const preview = text.length > 400 ? `${text.slice(0, 400)}…` : text;
  return {
    ok: !mcpCallToolResult?.isError,
    operationId,
    responsePreview: preview,
  };
}

function printConsoleSummary(out, dest) {
  console.log("=== ClawQL complex release-stack (MCP workflow) ===\n");
  console.log(`Transport: ${out.meta.transport}`);
  if (out.meta.mcpUrl) console.log(`URL: ${out.meta.mcpUrl}`);
  console.log(
    "This workflow expects the MCP server to merge every bundled vendor (same as CLAWQL_PROVIDER=all-providers). " +
      "The stdio transport forces that; an HTTP server must be started with that preset too."
  );
  console.log(
    `Mode: ${out.meta.executeEnabled ? "execute on (WORKFLOW_MCP_EXECUTE=1)" : "dry run — search only (set WORKFLOW_MCP_EXECUTE=1 to call execute)"}`
  );
  if (out.meta.mergedOperationCount != null) {
    console.log(`Merged operations (from server stderr): ${out.meta.mergedOperationCount}`);
  }
  console.log(
    `Search → provider pick: up to ${out.meta.searchLimitQuick} hits, then up to ${out.meta.searchLimitWide} if no vendor match (MCP search allows max ${MCP_SEARCH_HARD_CAP}).`
  );
  console.log("");

  for (const step of out.steps) {
    console.log(`--- [${step.provider}] ${step.title} ---`);
    for (const q of step.queries) {
      const hits = parseSearchResultsFromMcpCall(q.mcpSearch);
      const m = q.matchedHit;
      console.log(
        `\n  Query: "${q.query}" — ${hits.length} raw hits` +
          (m ? ` → match: ${m.method} ${m.id}` : " → no provider-scoped match")
      );
      if (!m && hits.length > 0 && step.provider !== "google") {
        const top = hits[0];
        const slug = top.specLabel ?? "(none)";
        const widened = q.searchWidened ? " (after widen)" : "";
        console.log(
          `    hint: top hit specLabel=${slug} (want "${step.provider}") in top ${hits.length} results${widened} — another vendor ranked higher; try a narrower query or increase WORKFLOW_MCP_SEARCH_LIMIT (wide, max ${MCP_SEARCH_HARD_CAP}). If this persists, check CLAWQL_PROVIDER=all-providers on the MCP pod.`
        );
      }
      if (q.executeSummary) {
        const s = q.executeSummary;
        console.log(
          `    execute: ${s.ok ? "ok" : "error"} — ${s.error ?? s.responsePreview?.split("\n")[0]?.slice(0, 120) ?? ""}`
        );
      }
    }
    console.log("");
  }

  console.log("--- ---");
  console.log(`Report: ${dest}`);
  console.log(
    JSON.stringify(
      { ok: true, exit: "success", reportPath: dest, transport: out.meta.transport },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
