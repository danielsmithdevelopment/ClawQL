import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { buildMcpServerConfig, type McpConfigOptions } from "./mcp-config.js";

export type McpWriteTarget = "cursor" | "claude-desktop";

export function resolveMcpConfigPath(target: McpWriteTarget): string {
  if (target === "cursor") {
    return join(homedir(), ".cursor", "mcp.json");
  }
  const home = homedir();
  if (platform() === "darwin") {
    return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (platform() === "win32") {
    const appData = process.env.APPDATA?.trim() || join(home, "AppData", "Roaming");
    return join(appData, "Claude", "claude_desktop_config.json");
  }
  return join(home, ".config", "Claude", "claude_desktop_config.json");
}

export type WriteMcpConfigResult = {
  path: string;
  backupPath?: string;
  created: boolean;
};

export async function writeMcpConfigFile(
  target: McpWriteTarget,
  options: McpConfigOptions = {},
): Promise<WriteMcpConfigResult> {
  const path = resolveMcpConfigPath(target);
  await mkdir(dirname(path), { recursive: true });

  let existing: Record<string, unknown> = {};
  let created = true;
  let backupPath: string | undefined;

  if (existsSync(path)) {
    created = false;
    const raw = await readFile(path, "utf8");
    existing = JSON.parse(raw) as Record<string, unknown>;
    backupPath = `${path}.bak-${Date.now()}`;
    await copyFile(path, backupPath);
  }

  const incoming = buildMcpServerConfig(options);
  const incomingServers = (incoming.mcpServers ?? {}) as Record<string, unknown>;
  const mergedServers = {
    ...((existing.mcpServers as Record<string, unknown> | undefined) ?? {}),
    ...incomingServers,
  };

  const out: Record<string, unknown> = {
    ...existing,
    mcpServers: mergedServers,
  };
  delete out._clawql_note;

  await writeFile(path, `${JSON.stringify(out, null, 2)}\n`, "utf8");

  return { path, backupPath, created };
}
