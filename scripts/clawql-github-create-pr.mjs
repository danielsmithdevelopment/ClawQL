#!/usr/bin/env node
/**
 * Opens a pull request via ClawQL MCP `execute` (GitHub provider, pulls/create).
 *
 *   export CLAWQL_BEARER_TOKEN="$(gh auth token)"   # or GITHUB_TOKEN
 *   export GITHUB_OWNER=danielsmithdevelopment GITHUB_REPO=ClawQL
 *   export PR_HEAD=feature/my-branch PR_BASE=main
 *   export PR_TITLE="..." PR_BODY="..."   # optional body; default empty
 *
 *   npm run build && node scripts/clawql-github-create-pr.mjs
 */

import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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
  const owner =
    process.env.GITHUB_OWNER?.trim() || process.env.GH_OWNER?.trim();
  const repo =
    process.env.GITHUB_REPO?.trim() || process.env.GH_REPO?.trim();
  const head = process.env.PR_HEAD?.trim();
  const base = process.env.PR_BASE?.trim() || "main";
  const title = process.env.PR_TITLE?.trim();
  const body = process.env.PR_BODY?.trim() ?? "";

  if (!owner || !repo || !head || !title) {
    console.error(
      "Required: GITHUB_OWNER, GITHUB_REPO, PR_HEAD, PR_TITLE. Optional: PR_BASE (default main), PR_BODY."
    );
    process.exit(1);
  }

  const fromEnv =
    process.env.CLAWQL_BEARER_TOKEN?.trim() ||
    process.env.GITHUB_TOKEN?.trim();
  const token = fromEnv || tokenFromGhCli();
  if (!token) {
    console.error(
      "Need CLAWQL_BEARER_TOKEN, GITHUB_TOKEN, or logged-in `gh auth token`."
    );
    process.exit(1);
  }

  const childEnv = { ...process.env };
  childEnv.CLAWQL_PROVIDER = "github";
  childEnv.CLAWQL_BUNDLED_OFFLINE = process.env.CLAWQL_BUNDLED_OFFLINE ?? "1";
  childEnv.CLAWQL_BEARER_TOKEN = token;
  delete childEnv.CLAWQL_SPEC_URL;
  delete childEnv.CLAWQL_SPEC_PATH;
  delete childEnv.CLAWQL_DISCOVERY_URL;
  delete childEnv.CLAWQL_GOOGLE_TOP50_SPECS;
  delete childEnv.CLAWQL_SPEC_PATHS;

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, "dist", "server.js")],
    cwd: ROOT,
    stderr: "inherit",
    env: childEnv,
  });

  const client = new Client(
    { name: "clawql-github-create-pr", version: "1.0.0" },
    {}
  );
  await client.connect(transport);

  const execRes = await client.callTool({
    name: "execute",
    arguments: {
      operationId: "pulls/create",
      args: {
        owner,
        repo,
        title,
        head,
        base,
        body,
      },
      fields: ["html_url", "number", "title", "state", "url"],
    },
  });

  await client.close();

  const text = execRes.content?.find((b) => b.type === "text")?.text ?? "";
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error(text);
    process.exit(1);
  }

  if (execRes.isError) {
    console.error(JSON.stringify(parsed, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(parsed, null, 2));
  console.error("\nOK — pull request created via ClawQL execute(pulls/create).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
