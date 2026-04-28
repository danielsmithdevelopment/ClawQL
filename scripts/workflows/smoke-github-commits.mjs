#!/usr/bin/env node
/**
 * MCP smoke: GitHub bundled provider — list the last N commits on `main` via `execute`.
 *
 * Operation: `repos/list-commits` → GET /repos/{owner}/{repo}/commits
 * (Tip of `main`: latest commits on that branch. For “only PR merge commits”, use the Pull Requests API instead.)
 *
 * Auth (recommended: GitHub CLI — Option A)
 *   gh auth login
 *   # No export needed: this script runs `gh auth token` when CLAWQL_BEARER_TOKEN
 *   # and GITHUB_TOKEN are unset. Opt out: GITHUB_USE_GH_TOKEN=0
 *
 * Or set a PAT explicitly:
 *   export CLAWQL_BEARER_TOKEN=ghp_...   # classic / fine-grained
 *
 * Targets:
 *   GITHUB_OWNER (default: github)   GITHUB_REPO (default: rest-api-description)
 *   example: GITHUB_OWNER=octocat GITHUB_REPO=Hello-World
 *
 *   npm run smoke:github-commits
 */

import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const owner = process.env.GITHUB_OWNER?.trim() || "github";
const repo = process.env.GITHUB_REPO?.trim() || "rest-api-description";
const perPage = Math.min(
  30,
  Math.max(1, Number(process.env.GITHUB_COMMIT_LIMIT ?? "5") || 5)
);

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
  const fromEnv =
    process.env.CLAWQL_BEARER_TOKEN?.trim() ||
    process.env.GITHUB_TOKEN?.trim();
  const fromGh = fromEnv ? "" : tokenFromGhCli();
  const token = fromEnv || fromGh;
  const authLabel = fromEnv
    ? "CLAWQL_BEARER_TOKEN / GITHUB_TOKEN"
    : fromGh
      ? "gh auth token (GitHub CLI)"
      : "none (public repo only)";

  const childEnv = { ...process.env };
  childEnv.CLAWQL_PROVIDER = "github";
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
    { name: "clawql-github-commits", version: "1.0.0" },
    {}
  );
  await client.connect(transport);

  const searchRes = await client.callTool({
    name: "search",
    arguments: {
      query: "GitHub REST list commits for repository GET repos owner repo commits",
      limit: 10,
    },
  });

  /** OpenAPI operationId from github/rest-api-description (do not fuzzy-match: similar paths exist). */
  const operationId = "repos/list-commits";
  const searchText = searchRes.content?.find((b) => b.type === "text")?.text;
  if (searchText) {
    try {
      const parsedSearch = JSON.parse(searchText);
      const rank = parsedSearch.results?.findIndex((r) => r.id === operationId);
      if (rank != null && rank >= 0) {
        console.error(
          `[search] "${operationId}" is hit #${rank + 1} of ${parsedSearch.results?.length ?? 0}`
        );
      }
    } catch {
      /* ignore */
    }
  }

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
      fields: ["sha", "commit", "author", "html_url"],
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

  console.log("=== GitHub provider: last commits on main (MCP execute) ===\n");
  console.log(
    `Repo: ${owner}/${repo}  operationId: ${operationId}  per_page: ${perPage}`
  );
  console.log(`Auth: ${authLabel}\n`);

  if (execRes.isError) {
    console.error(JSON.stringify(parsed, null, 2));
    process.exit(1);
  }

  if (!Array.isArray(parsed)) {
    console.error(JSON.stringify(parsed, null, 2));
    throw new Error("Expected JSON array of commits");
  }

  const summary = parsed.map((c) => ({
    sha: c.sha?.slice?.(0, 7),
    message: c.commit?.message?.split?.("\n")?.[0],
    author: c.commit?.author?.name,
    date: c.commit?.author?.date,
    login: c.author?.login,
  }));

  console.log(JSON.stringify(summary, null, 2));
  console.error("\nOK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
