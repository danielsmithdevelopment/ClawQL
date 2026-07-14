import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import type { CodeGraphDocument } from "../types.js";
import { defaultCodeGraphId, graphifyJsonPath, graphifyRefreshCommand } from "../config/backend.js";
import { importGraphifyJson, type GraphifyGraphJson } from "../import/graphify-import.js";

const execFileAsync = promisify(execFile);

export async function maybeRefreshGraphifyJson(): Promise<void> {
  const cmd = graphifyRefreshCommand();
  if (!cmd) return;
  await execFileAsync("sh", ["-c", cmd], { timeout: 120_000 });
}

export async function loadGraphifyDocument(options: {
  graphId?: string;
  jsonPath?: string;
  rootPath?: string;
}): Promise<CodeGraphDocument> {
  await maybeRefreshGraphifyJson();
  const jsonPath = options.jsonPath ?? graphifyJsonPath();
  if (!jsonPath) {
    throw new Error(
      "Graphify backend requires CLAWQL_CODEGRAPH_GRAPHIFY_JSON pointing to graph.json"
    );
  }
  const raw = JSON.parse(await fs.readFile(jsonPath, "utf8")) as GraphifyGraphJson;
  return importGraphifyJson(raw, {
    graphId: options.graphId ?? defaultCodeGraphId(),
    rootPath: options.rootPath ?? jsonPath,
  });
}

/** Optional MCP-style delegate: POST JSON to a local Graphify HTTP MCP endpoint. */
export async function graphifyMcpQuery(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const base = process.env.CLAWQL_CODEGRAPH_GRAPHIFY_MCP_URL?.trim();
  if (!base) {
    throw new Error("CLAWQL_CODEGRAPH_GRAPHIFY_MCP_URL is not set");
  }
  const res = await fetch(`${base.replace(/\/$/, "")}/tools/call`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: toolName, arguments: args }),
  });
  if (!res.ok) {
    throw new Error(`Graphify MCP delegate failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export function graphifyMcpDelegateEnabled(): boolean {
  return Boolean(process.env.CLAWQL_CODEGRAPH_GRAPHIFY_MCP_URL?.trim());
}
