#!/usr/bin/env node
/**
 * Uses ClawQL MCP `execute` only (GitHub provider) to PATCH repo description.
 *
 *   export CLAWQL_BEARER_TOKEN="$(gh auth token)"   # needs repo scope / admin on repo
 *   export GITHUB_OWNER=danielsmithdevelopment GITHUB_REPO=ClawQL
 *   npm run build && node scripts/dev/clawql-github-patch-repo-description.mjs
 *
 * Override text: REPO_DESCRIPTION="..." (max 350 chars on GitHub)
 */

import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const DEFAULT_DESCRIPTION =
  "MCP server: search + execute over OpenAPI 3, Swagger 2, or Google Discovery, " +
  "with optional internal GraphQL for lean API responses. Bundled multi-provider specs " +
  "(GCP top 50, Cloudflare, Jira, GitHub, Slack, Sentry, n8n) let agents discover " +
  "operations without loading full API definitions into context.";

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
  if (!owner || !repo) {
    console.error(
      "Set GITHUB_OWNER and GITHUB_REPO (or GH_OWNER / GH_REPO)."
    );
    process.exit(1);
  }

  const description = (
    process.env.REPO_DESCRIPTION?.trim() || DEFAULT_DESCRIPTION
  ).slice(0, 350);

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
    { name: "clawql-patch-repo-desc", version: "1.0.0" },
    {}
  );
  await client.connect(transport);

  const execRes = await client.callTool({
    name: "execute",
    arguments: {
      operationId: "repos/update",
      args: {
        owner,
        repo,
        description,
      },
      fields: ["id", "name", "full_name", "description", "html_url"],
    },
  });

  await client.close();

  const text = execRes.content?.find((b) => b.type === "text")?.text ?? "";
  const parsed = JSON.parse(text);

  if (execRes.isError) {
    console.error(JSON.stringify(parsed, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(parsed, null, 2));
  console.error("\nOK — repository description updated via ClawQL execute(repos/update).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
