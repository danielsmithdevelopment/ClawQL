import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getPackageRoot } from "clawql-api";
import { getClawqlHome } from "./paths.js";
import { readLocalProvidersVault } from "../provider-vault/local-store.js";

export type SmokeStep = {
  name: string;
  status: "pass" | "warn" | "fail";
  detail?: string;
};

export type SmokeReport = {
  steps: SmokeStep[];
};

function packageDistServer(): string {
  try {
    return join(getPackageRoot(), "dist", "server.js");
  } catch {
    const here = dirname(fileURLToPath(import.meta.url));
    return join(here, "..", "server.js");
  }
}

function childEnvForSmoke(): Record<string, string> {
  const home = getClawqlHome();
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  env.CLAWQL_HOME = home;
  env.CLAWQL_OBSIDIAN_VAULT_PATH = process.env.CLAWQL_OBSIDIAN_VAULT_PATH?.trim() || home;
  return env;
}

function parseToolText(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content;
  const text = content?.find((b) => b.type === "text")?.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function runMcpSmoke(): Promise<SmokeReport> {
  const steps: SmokeStep[] = [];
  const serverJs = packageDistServer();

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverJs],
    cwd: getPackageRoot(),
    stderr: "pipe",
    env: childEnvForSmoke(),
  });

  const client = new Client({ name: "clawql-smoke", version: "1.0.0" }, {});

  try {
    await client.connect(transport);

    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    if (names.has("search") && names.has("execute")) {
      steps.push({
        name: "tools/list",
        status: "pass",
        detail: `${tools.length} tools (search, execute present)`,
      });
    } else {
      steps.push({
        name: "tools/list",
        status: "fail",
        detail: `missing search or execute; got: ${[...names].sort().join(", ")}`,
      });
      return { steps };
    }

    const searchRes = await client.callTool({
      name: "search",
      arguments: { query: "github repository", limit: 5 },
    });
    if (searchRes.isError) {
      steps.push({ name: "search", status: "fail", detail: "search returned isError" });
    } else {
      const body = parseToolText(searchRes);
      const hits = Array.isArray(body)
        ? body.length
        : typeof body === "object" && body !== null && "results" in body
          ? ((body as { results: unknown[] }).results?.length ?? 0)
          : 1;
      steps.push({
        name: "search",
        status: hits > 0 ? "pass" : "warn",
        detail: hits > 0 ? `${hits} hit(s) for "github repository"` : "no hits (spec index empty?)",
      });
    }

    const vault = await readLocalProvidersVault();
    const secretCount = vault
      ? Object.keys(vault.data).filter((k) => vault.data[k]?.trim()).length
      : 0;
    if (secretCount === 0) {
      steps.push({
        name: "execute",
        status: "warn",
        detail: "SKIP — no provider secrets in vault (search-only smoke)",
      });
      return { steps };
    }

    const searchBody = parseToolText(searchRes);
    const firstOp =
      Array.isArray(searchBody) && searchBody[0] && typeof searchBody[0] === "object"
        ? (searchBody[0] as { operationId?: string }).operationId
        : undefined;

    if (!firstOp) {
      steps.push({ name: "execute", status: "warn", detail: "SKIP — no operationId from search" });
      return { steps };
    }

    const execRes = await client.callTool({
      name: "execute",
      arguments: {
        operationId: firstOp,
        fields: {},
      },
    });

    if (execRes.isError) {
      const errText = parseToolText(execRes);
      const msg = typeof errText === "string" ? errText : JSON.stringify(errText);
      const authLike = /auth|401|403|token|credential|unauthorized/i.test(msg);
      steps.push({
        name: "execute",
        status: authLike ? "warn" : "fail",
        detail: authLike
          ? `auth expected for live call (${firstOp}) — vault present but token may be invalid`
          : `execute failed for ${firstOp}`,
      });
    } else {
      steps.push({
        name: "execute",
        status: "pass",
        detail: `OK ${firstOp} (read-only args)`,
      });
    }
  } catch (e: unknown) {
    steps.push({
      name: "mcp-connect",
      status: "fail",
      detail: e instanceof Error ? e.message : String(e),
    });
  } finally {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
  }

  return { steps };
}

export function formatSmokeReport(report: SmokeReport): string {
  const lines = ["ClawQL smoke (MCP)", ""];
  for (const step of report.steps) {
    const icon = step.status === "pass" ? "✓" : step.status === "warn" ? "!" : "✗";
    lines.push(`  ${icon} ${step.name}: ${step.status}${step.detail ? ` — ${step.detail}` : ""}`);
  }
  lines.push("");
  return lines.join("\n");
}
