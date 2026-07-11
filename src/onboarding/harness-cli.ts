/**
 * Harness wrappers: launch agent CLIs with ClawQL MCP pre-wired (Executor parity).
 *
 *   clawql claude | codex | cursor | opencode [-- forwarded args]
 */

import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { buildMcpServerConfig } from "./mcp-config.js";
import { getClawqlHome } from "./paths.js";
import { runInit } from "./init.js";
import { ensureHarnessSandboxGate } from "clawql-sandbox/init";

export type HarnessId = "claude" | "codex" | "cursor" | "opencode";

const HARNESS_BIN: Record<HarnessId, string[]> = {
  claude: ["claude", "claude-code"],
  codex: ["codex"],
  cursor: ["cursor"],
  opencode: ["opencode"],
};

export function resolveHarnessBinary(id: HarnessId): string {
  const candidates = HARNESS_BIN[id];
  for (const name of candidates) {
    const pathEnv = process.env.PATH ?? "";
    for (const dir of pathEnv.split(":")) {
      const full = join(dir, name);
      if (existsSync(full)) return full;
    }
  }
  return candidates[0]!;
}

async function ensureClawqlHome(): Promise<void> {
  const home = getClawqlHome();
  if (!existsSync(home)) {
    await runInit({ yes: true, home });
  }
}

async function writeCursorMcp(): Promise<void> {
  const { writeMcpConfigFile } = await import("./mcp-config-write.js");
  await writeMcpConfigFile("cursor");
}

async function writeClaudeDesktopMcp(): Promise<void> {
  const { writeMcpConfigFile } = await import("./mcp-config-write.js");
  await writeMcpConfigFile("claude-desktop");
}

async function writeOpencodeMcp(): Promise<void> {
  const home = getClawqlHome();
  const cfgDir =
    platform() === "win32"
      ? join(process.env.APPDATA?.trim() || join(homedir(), "AppData", "Roaming"), "opencode")
      : join(homedir(), ".config", "opencode");
  const cfgPath = join(cfgDir, "opencode.json");
  await mkdir(cfgDir, { recursive: true });

  let existing: Record<string, unknown> = {};
  if (existsSync(cfgPath)) {
    existing = JSON.parse(await readFile(cfgPath, "utf8")) as Record<string, unknown>;
    await copyFile(cfgPath, `${cfgPath}.bak-${Date.now()}`);
  }

  const mcpBlock = buildMcpServerConfig({ includeHomeEnv: true }).mcpServers as Record<
    string,
    unknown
  >;
  const clawql = mcpBlock.clawql as Record<string, unknown> | undefined;
  const command = Array.isArray(clawql?.args)
    ? ["npx", "-p", "clawql-mcp", "clawql-mcp"]
    : ["npx", "-p", "clawql-mcp", "clawql-mcp"];

  const mcp = (existing.mcp as Record<string, unknown> | undefined) ?? {};
  mcp.clawql = {
    type: "local",
    command,
    enabled: true,
    environment: {
      CLAWQL_HOME: home,
      ...(typeof clawql?.env === "object" ? (clawql.env as Record<string, string>) : {}),
    },
  };

  const out = {
    $schema: "https://opencode.ai/config.json",
    ...existing,
    mcp,
  };
  await writeFile(cfgPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");
}

async function writeCodexMcp(): Promise<void> {
  const home = getClawqlHome();
  const cfgPath = join(homedir(), ".codex", "config.toml");
  await mkdir(dirname(cfgPath), { recursive: true });

  const block = `
[mcp_servers.clawql]
command = "npx"
args = ["-p", "clawql-mcp", "clawql-mcp"]
enabled = true

[mcp_servers.clawql.env]
CLAWQL_HOME = "${home.replace(/\\/g, "\\\\")}"
`;

  if (existsSync(cfgPath)) {
    const raw = await readFile(cfgPath, "utf8");
    if (!raw.includes("[mcp_servers.clawql]")) {
      await copyFile(cfgPath, `${cfgPath}.bak-${Date.now()}`);
      await writeFile(cfgPath, `${raw.trimEnd()}\n${block}`, "utf8");
    }
    return;
  }
  await writeFile(cfgPath, block.trimStart(), "utf8");
}

export async function prepareHarness(id: HarnessId): Promise<void> {
  await ensureClawqlHome();
  switch (id) {
    case "cursor":
      await writeCursorMcp();
      return;
    case "claude":
      await writeClaudeDesktopMcp();
      return;
    case "codex":
      await writeCodexMcp();
      return;
    case "opencode":
      await writeOpencodeMcp();
      return;
  }
}

export async function runHarness(id: HarnessId, forwarded: string[]): Promise<number> {
  await prepareHarness(id);
  const bin = resolveHarnessBinary(id);

  if (!existsSync(bin) && bin === HARNESS_BIN[id][0]) {
    console.error(
      `[clawql ${id}] Harness binary "${bin}" not found on PATH. Install it, then retry.`
    );
    console.error(`MCP config for ClawQL was written; you can start ${id} manually.`);
    return 1;
  }

  const gate = await ensureHarnessSandboxGate(id, getClawqlHome(), process.cwd());
  if (!gate.ok) {
    console.error(`[clawql ${id}] ${gate.error}`);
    console.error("Fix: clawql sandbox init && clawql sandbox verify");
    return 1;
  }

  const spawnBin = gate.wrap ? "/usr/bin/sandbox-exec" : bin;
  const spawnArgs = gate.wrap ? gate.sandboxArgv(bin, forwarded) : forwarded;

  return new Promise((resolve) => {
    const child = spawn(spawnBin, spawnArgs, {
      stdio: "inherit",
      env: {
        ...process.env,
        CLAWQL_HOME: getClawqlHome(),
      },
    });
    child.on("exit", (code, signal) => {
      if (signal) resolve(1);
      else resolve(code ?? 0);
    });
    child.on("error", (err) => {
      console.error(`[clawql ${id}]`, err.message);
      resolve(1);
    });
  });
}
