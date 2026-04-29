#!/usr/bin/env node
/**
 * MCP smoke for OpenClaw bootstrap (#226): listTools + search/execute (GitHub) + document tool visibility.
 *
 *   npm run build && npm run smoke:openclaw-bootstrap
 *
 * CLAWQL_OPENCLAW_BOOTSTRAP_TOOLS_ONLY=1 — skip search/execute (tools list only).
 *
 * GitHub execute auth: same as smoke-github-commits (CLAWQL_BEARER_TOKEN or gh auth token).
 */

import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function tokenFromGhCli() {
  if (process.env.GITHUB_USE_GH_TOKEN === "0") return "";
  try {
    return execSync("gh auth token", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    }).trim();
  } catch {
    return "";
  }
}

async function main() {
  const toolsOnly =
    process.env.CLAWQL_OPENCLAW_BOOTSTRAP_TOOLS_ONLY === "1" ||
    process.env.CLAWQL_OPENCLAW_BOOTSTRAP_TOOLS_ONLY === "true";

  const fromEnv =
    process.env.CLAWQL_BEARER_TOKEN?.trim() ||
    process.env.GITHUB_TOKEN?.trim();
  const fromGh = fromEnv ? "" : tokenFromGhCli();
  const token = fromEnv || fromGh;

  const childEnv = { ...process.env };
  childEnv.CLAWQL_PROVIDER = process.env.CLAWQL_PROVIDER ?? "github";
  childEnv.CLAWQL_BUNDLED_OFFLINE = process.env.CLAWQL_BUNDLED_OFFLINE ?? "1";
  if (token) {
    childEnv.CLAWQL_BEARER_TOKEN = token;
    childEnv.GITHUB_TOKEN = token;
  } else {
    delete childEnv.CLAWQL_BEARER_TOKEN;
    delete childEnv.GITHUB_TOKEN;
  }
  delete childEnv.CLAWQL_SPEC_URL;
  delete childEnv.CLAWQL_SPEC_PATH;
  delete childEnv.CLAWQL_DISCOVERY_URL;
  delete childEnv.CLAWQL_GOOGLE_TOP50_SPECS;
  delete childEnv.CLAWQL_SPEC_PATHS;
  delete childEnv.CLAWQL_HTTP_HEADERS;

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, "dist", "server.js")],
    cwd: ROOT,
    stderr: "inherit",
    env: childEnv,
  });

  const client = new Client(
    { name: "clawql-openclaw-bootstrap", version: "1.0.0" },
    {}
  );
  await client.connect(transport);

  const listed = await client.listTools();
  const names = new Set((listed.tools ?? []).map((t) => t.name));

  const required = ["search", "execute"];
  for (const n of required) {
    if (!names.has(n)) {
      throw new Error(`listTools missing required tool: ${n}`);
    }
  }

  const docsOn =
    process.env.CLAWQL_ENABLE_DOCUMENTS === undefined ||
    !/^(0|false|no)$/i.test(String(process.env.CLAWQL_ENABLE_DOCUMENTS));

  if (docsOn && !names.has("ingest_external_knowledge")) {
    throw new Error(
      "listTools missing ingest_external_knowledge (documents enabled)"
    );
  }

  console.error(
    `[listTools] OK: search, execute${docsOn ? ", ingest_external_knowledge" : ""} (${listed.tools?.length ?? 0} tools)`
  );

  if (toolsOnly) {
    await client.close();
    console.error("\nOK (tools-only)");
    return;
  }

  const owner = process.env.GITHUB_OWNER?.trim() || "github";
  const repo = process.env.GITHUB_REPO?.trim() || "rest-api-description";
  const perPage = Math.min(
    5,
    Math.max(1, Number(process.env.GITHUB_COMMIT_LIMIT ?? "3") || 3)
  );
  const operationId = "repos/list-commits";

  await client.callTool({
    name: "search",
    arguments: {
      query: "GitHub REST list commits for repository GET repos owner repo commits",
      limit: 10,
    },
  });

  const execRes = await client.callTool({
    name: "execute",
    arguments: {
      operationId,
      args: {
        owner,
        repo,
        sha: "main",
        per_page: perPage,
      },
      fields: ["sha", "commit"],
    },
  });

  await client.close();

  const execText = execRes.content?.find((b) => b.type === "text")?.text ?? "";
  let parsed;
  try {
    parsed = JSON.parse(execText);
  } catch {
    console.error(execText);
    throw new Error("execute did not return JSON");
  }

  if (execRes.isError) {
    console.error(JSON.stringify(parsed, null, 2));
    throw new Error("execute reported error");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Expected JSON array from repos/list-commits");
  }

  console.log("=== OpenClaw bootstrap smoke (GitHub execute) ===\n");
  console.log(`Repo: ${owner}/${repo}  operationId: ${operationId}`);
  console.log(JSON.stringify(parsed.slice(0, 3), null, 2));
  console.error("\nOK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
