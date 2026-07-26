/**
 * Harness wrappers: launch agent CLIs with ClawQL MCP pre-wired (Executor parity).
 *
 *   clawql claude | codex | cursor | opencode [-- forwarded args]
 *   clawql claude --non-interactive --model <id> --task-file <path> [--workdir DIR]
 */

import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { existsSync } from "node:fs";
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

export type NonInteractiveOpts = {
  /** Model id in the target harness's native form (e.g. claude-sonnet-4, openai/gpt-5.5). */
  model?: string;
  /** Path to a markdown/text instruction file. */
  taskFile?: string;
  /** Inline instruction (used when taskFile is omitted). */
  instruction?: string;
  /** Working directory for the agent (defaults to cwd). */
  workdir?: string;
  /** Soft timeout in seconds (best-effort kill). */
  timeoutS?: number;
  /** Optional inference gateway base URL forwarded to the child env. */
  inferenceUrl?: string;
  /** When true, also write `.token_usage` into workdir for OpenBench checkers. */
  writeTokenUsage?: boolean;
};

export type BenchUsage = {
  tokens: number | null;
  turns: number | null;
  tokensInputUncached: number | null;
  tokensOutput: number | null;
  tokenBasis: string | null;
};

export type NonInteractiveResult = {
  exitCode: number;
  completed: boolean;
  error: string | null;
  outputTail: string;
  fullOutput: string;
  cmd: string[];
  usage: BenchUsage;
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

/** Prefer workspace `bin/clawql-mcp.mjs` (OpenBench CI) over published npx. */
export function resolveClawqlMcpCommand(): string[] {
  const fromBin = process.env.CLAWQL_BIN?.trim();
  if (fromBin?.endsWith("clawql.mjs")) {
    const mcp = fromBin.replace(/clawql\.mjs$/, "clawql-mcp.mjs");
    if (existsSync(mcp)) return ["node", mcp];
  }
  const argv1 = process.argv[1];
  if (typeof argv1 === "string" && argv1.endsWith("clawql.mjs")) {
    const mcp = argv1.replace(/clawql\.mjs$/, "clawql-mcp.mjs");
    if (existsSync(mcp)) return ["node", mcp];
  }
  return ["npx", "-p", "clawql-mcp", "clawql-mcp"];
}

/** Env passed into the OpenCode-local ClawQL MCP child (vault + memory for OpenBench). */
export function clawqlMcpChildEnv(home = getClawqlHome()): Record<string, string> {
  const vault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH?.trim() || home;
  const env: Record<string, string> = {
    CLAWQL_HOME: home,
    CLAWQL_OBSIDIAN_VAULT_PATH: vault,
    CLAWQL_ENABLE_MEMORY: process.env.CLAWQL_ENABLE_MEMORY?.trim() || "1",
    CLAWQL_BUNDLED_OFFLINE: process.env.CLAWQL_BUNDLED_OFFLINE?.trim() || "1",
  };
  if (process.env.CLAWQL_OPENBENCH?.trim()) {
    env.CLAWQL_OPENBENCH = process.env.CLAWQL_OPENBENCH.trim();
    // Slim tool surface for cheap OpenBench models — avoid pageindex/docs noise.
    if (!process.env.CLAWQL_ENABLE_PAGEINDEX?.trim()) env.CLAWQL_ENABLE_PAGEINDEX = "0";
    if (!process.env.CLAWQL_ENABLE_DOCUMENTS?.trim()) env.CLAWQL_ENABLE_DOCUMENTS = "0";
    // Default recall snippets (520) truncate OpenBench vault recipes (full YAML
    // parser / scaffold notes). Raise so clawql-on can apply recalled content.
    if (!process.env.CLAWQL_MEMORY_RECALL_SNIPPET_CHARS?.trim()) {
      env.CLAWQL_MEMORY_RECALL_SNIPPET_CHARS = "8192";
    }
  }
  // Forward Ouroboros enablement + generation ceiling into the MCP child.
  // Parent env alone is not inherited by OpenCode's local MCP `environment` map.
  if (process.env.CLAWQL_ENABLE_OUROBOROS?.trim()) {
    env.CLAWQL_ENABLE_OUROBOROS = process.env.CLAWQL_ENABLE_OUROBOROS.trim();
  }
  if (process.env.CLAWQL_OUROBOROS_MAX_GENERATIONS?.trim()) {
    env.CLAWQL_OUROBOROS_MAX_GENERATIONS = process.env.CLAWQL_OUROBOROS_MAX_GENERATIONS.trim();
  }
  return env;
}

/**
 * Headless OpenBench permissions: auto-approve normal tools, but deny doom_loop
 * so identical tool spam (e.g. re-reading the same file 200×) cannot burn the timeout.
 */
export function openbenchOpencodePermissions(): Record<string, string> {
  return {
    "*": "allow",
    doom_loop: "deny",
  };
}

/**
 * OpenCode config for OpenBench / non-interactive: provider + MCP in one JSON.
 * OPENCODE_CONFIG_CONTENT replaces file config — MCP must be embedded here or
 * clawql-on runs without memory_recall (both arms look identical).
 */
export function buildOpencodeConfigContent(opts: {
  inferenceUrl: string;
  gatewayModel: string;
  home?: string;
}): string {
  const home = opts.home ?? getClawqlHome();
  const base = opts.inferenceUrl.trim().replace(/\/$/, "");
  const inferenceUrl = base.endsWith("/v1") ? base : `${base}/v1`;
  const gatewayModel = opts.gatewayModel.trim().replace(/^clawql\//, "");
  const mcpEnv = clawqlMcpChildEnv(home);
  mcpEnv.CLAWQL_OPENBENCH = mcpEnv.CLAWQL_OPENBENCH || "1";
  if (!mcpEnv.CLAWQL_ENABLE_PAGEINDEX) mcpEnv.CLAWQL_ENABLE_PAGEINDEX = "0";
  if (!mcpEnv.CLAWQL_ENABLE_DOCUMENTS) mcpEnv.CLAWQL_ENABLE_DOCUMENTS = "0";
  if (!mcpEnv.CLAWQL_MEMORY_RECALL_SNIPPET_CHARS) {
    mcpEnv.CLAWQL_MEMORY_RECALL_SNIPPET_CHARS = "8192";
  }
  return JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    permission: openbenchOpencodePermissions(),
    provider: {
      clawql: {
        npm: "@ai-sdk/openai-compatible",
        name: "ClawQL Inference",
        options: {
          baseURL: inferenceUrl,
          apiKey: process.env.CLAWQL_INFERENCE_CLIENT_KEY?.trim() || "clawql-openbench",
        },
        models: { [gatewayModel]: {} },
      },
    },
    mcp: {
      clawql: {
        type: "local",
        command: resolveClawqlMcpCommand(),
        enabled: true,
        environment: mcpEnv,
      },
    },
  });
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

  const mcp = (existing.mcp as Record<string, unknown> | undefined) ?? {};
  mcp.clawql = {
    type: "local",
    command: resolveClawqlMcpCommand(),
    enabled: true,
    environment: clawqlMcpChildEnv(home),
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
args = ["-y", "clawql-mcp"]
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

  return new Promise((resolvePromise) => {
    const child = spawn(spawnBin, spawnArgs, {
      stdio: "inherit",
      env: {
        ...process.env,
        CLAWQL_HOME: getClawqlHome(),
      },
    });
    child.on("exit", (code, signal) => {
      if (signal) resolvePromise(1);
      else resolvePromise(code ?? 0);
    });
    child.on("error", (err) => {
      console.error(`[clawql ${id}]`, err.message);
      resolvePromise(1);
    });
  });
}

function emptyUsage(): BenchUsage {
  return {
    tokens: null,
    turns: null,
    tokensInputUncached: null,
    tokensOutput: null,
    tokenBasis: null,
  };
}

function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

/** Best-effort parse of harness JSON / JSONL usage for OpenBench reporting. */
export function parseHarnessUsage(id: HarnessId, stdout: string): BenchUsage {
  const usage = emptyUsage();
  const text = (stdout || "").trim();
  if (!text) return usage;

  const tryObj = (obj: Record<string, unknown>): BenchUsage | null => {
    if (id === "claude") {
      const turns = asInt(obj.num_turns);
      const modelUsage = obj.modelUsage;
      let input = 0;
      let output = 0;
      let found = false;
      if (modelUsage && typeof modelUsage === "object") {
        for (const m of Object.values(modelUsage as Record<string, unknown>)) {
          if (!m || typeof m !== "object") continue;
          const row = m as Record<string, unknown>;
          const inp = asInt(row.inputTokens);
          const out = asInt(row.outputTokens);
          if (inp === null || out === null) continue;
          input += inp;
          output += out;
          found = true;
        }
      }
      if (!found && obj.usage && typeof obj.usage === "object") {
        const u = obj.usage as Record<string, unknown>;
        const inp = asInt(u.input_tokens);
        const out = asInt(u.output_tokens);
        if (inp !== null && out !== null) {
          input = inp;
          output = out;
          found = true;
        }
      }
      if (found) {
        return {
          tokens: input + output,
          turns,
          tokensInputUncached: input,
          tokensOutput: output,
          tokenBasis: "vendor_split",
        };
      }
    }

    if (id === "codex") {
      // Codex JSONL: look for turn.completed usage aggregates on this object.
      const u = obj.usage;
      if (u && typeof u === "object") {
        const row = u as Record<string, unknown>;
        const inp = asInt(row.input_tokens);
        const out = asInt(row.output_tokens);
        if (inp !== null && out !== null) {
          return {
            tokens: inp + out,
            turns: asInt(obj.turn_count) ?? asInt(obj.turns),
            tokensInputUncached: inp,
            tokensOutput: out,
            tokenBasis: "harness_reported",
          };
        }
      }
    }

    if (id === "opencode") {
      const props = obj.properties as Record<string, unknown> | undefined;
      const part = props?.part as Record<string, unknown> | undefined;
      const tokens = part?.tokens as Record<string, unknown> | undefined;
      if (tokens) {
        const inp = asInt(tokens.input) ?? asInt(tokens.prompt);
        const out = asInt(tokens.output) ?? asInt(tokens.completion);
        if (inp !== null && out !== null) {
          return {
            tokens: inp + out,
            turns: null,
            tokensInputUncached: inp,
            tokensOutput: out,
            tokenBasis: "harness_reported",
          };
        }
      }
    }

    // Generic CLAWQL_* lines are handled below; also accept explicit fields.
    const tokens = asInt(obj.tokens);
    const turns = asInt(obj.turns);
    if (tokens !== null || turns !== null) {
      return {
        tokens,
        turns,
        tokensInputUncached: asInt(obj.tokens_input_uncached),
        tokensOutput: asInt(obj.tokens_output),
        tokenBasis: typeof obj.token_basis === "string" ? obj.token_basis : "estimated",
      };
    }
    return null;
  };

  // Prefer a single JSON object (claude --output-format json).
  try {
    const obj = JSON.parse(text) as unknown;
    if (obj && typeof obj === "object") {
      const parsed = tryObj(obj as Record<string, unknown>);
      if (parsed) return parsed;
    }
  } catch {
    // fall through to JSONL / line scan
  }

  let best = usage;
  let turnEvents = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed) as unknown;
      if (!obj || typeof obj !== "object") continue;
      const row = obj as Record<string, unknown>;
      if (row.type === "turn_end" || row.type === "step_finish" || row.type === "turn.completed") {
        turnEvents += 1;
      }
      const parsed = tryObj(row);
      if (parsed && (parsed.tokens !== null || parsed.turns !== null)) {
        best = parsed;
      }
    } catch {
      // ignore non-JSON noise
    }
  }
  if (best.turns === null && turnEvents > 0) best.turns = turnEvents;
  return best;
}

function buildHeadlessArgv(
  id: HarnessId,
  instruction: string,
  workdir: string,
  model: string | undefined,
  extra: string[]
): string[] {
  switch (id) {
    case "claude": {
      const args = [
        "-p",
        "--bare",
        "--output-format",
        "json",
        "--dangerously-skip-permissions",
        "--disallowedTools",
        "Agent",
        "Task",
        "--no-session-persistence",
      ];
      if (model) args.push("--model", model);
      args.push(instruction, ...extra);
      return args;
    }
    case "codex": {
      const args = [
        "exec",
        "--json",
        "--skip-git-repo-check",
        "-C",
        workdir,
        "-s",
        "workspace-write",
        "--disable",
        "apps",
        "--disable",
        "plugins",
        "--disable",
        "multi_agent",
      ];
      if (model) args.push("-m", model);
      args.push(instruction, ...extra);
      return args;
    }
    case "opencode": {
      const args = [
        "run",
        "--dir",
        workdir,
        "--auto",
        "--format",
        "json",
        "--title",
        "clawql-openbench",
      ];
      if (model) args.push("-m", model);
      args.push(instruction, ...extra);
      return args;
    }
    case "cursor": {
      // Cursor agent CLI surface varies; prefer `agent` subcommand when present.
      // Extra forwarded args let operators pin exact flags for their Cursor build.
      const args = ["agent", "--print", instruction];
      if (model) args.push("--model", model);
      args.push(...extra);
      return args;
    }
  }
}

async function spawnCaptured(
  spawnBin: string,
  spawnArgs: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv; timeoutS?: number }
): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolvePromise) => {
    const child = spawn(spawnBin, spawnArgs, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const timer =
      opts.timeoutS && opts.timeoutS > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
            setTimeout(() => child.kill("SIGKILL"), 2000).unref();
          }, opts.timeoutS * 1000)
        : null;

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });

    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolvePromise({ code, stdout, stderr, timedOut });
    };

    child.on("error", (err) => {
      stderr += `\n${err.message}`;
      finish(1);
    });
    child.on("exit", (code, signal) => {
      if (timedOut) finish(124);
      else if (signal) finish(1);
      else finish(code ?? 0);
    });
  });
}

function emitBenchJson(payload: Record<string, unknown>): void {
  console.log(`CLAWQL_BENCH_JSON: ${JSON.stringify(payload)}`);
}

/**
 * Headless harness run for OpenBench / CI. Captures stdout, parses usage when
 * possible, and prints machine-readable summary lines:
 *
 *   CLAWQL_TOKENS: <n>
 *   CLAWQL_TURNS: <n>
 *   CLAWQL_BENCH_JSON: {...}
 */
export async function runHarnessNonInteractive(
  id: HarnessId,
  opts: NonInteractiveOpts,
  extraForwarded: string[] = []
): Promise<NonInteractiveResult> {
  await prepareHarness(id);
  const bin = resolveHarnessBinary(id);
  const workdir = resolve(opts.workdir?.trim() || process.cwd());

  if (!existsSync(bin) && bin === HARNESS_BIN[id][0]) {
    const msg = `Harness binary "${bin}" not found on PATH`;
    console.error(`[clawql ${id}] ${msg}`);
    emitBenchJson({ completed: false, error: msg, tokens: null, turns: null, exit_code: 1 });
    return {
      exitCode: 1,
      completed: false,
      error: msg,
      outputTail: "",
      fullOutput: "",
      cmd: [],
      usage: emptyUsage(),
    };
  }

  let instruction = opts.instruction?.trim() ?? "";
  if (opts.taskFile?.trim()) {
    const taskPath = isAbsolute(opts.taskFile)
      ? opts.taskFile
      : resolve(process.cwd(), opts.taskFile);
    instruction = (await readFile(taskPath, "utf8")).trim();
  }
  if (!instruction) {
    const msg = "Provide --task-file <path> or --message <instruction> for --non-interactive";
    console.error(`[clawql ${id}] ${msg}`);
    emitBenchJson({ completed: false, error: msg, tokens: null, turns: null, exit_code: 2 });
    return {
      exitCode: 2,
      completed: false,
      error: msg,
      outputTail: "",
      fullOutput: "",
      cmd: [],
      usage: emptyUsage(),
    };
  }

  // Soften Seatbelt fail-closed for disposable OpenBench workspaces: still
  // wrap when sandbox-exec is available, but do not block Linux CI runners.
  const gate = await ensureHarnessSandboxGate(id, getClawqlHome(), workdir);
  const allowUnsandboxed =
    process.env.CLAWQL_OPENBENCH === "1" || process.env.CLAWQL_HARNESS_ALLOW_UNSANDBOXED === "1";
  if (!gate.ok && !allowUnsandboxed) {
    console.error(`[clawql ${id}] ${gate.error}`);
    console.error("Fix: clawql sandbox init && clawql sandbox verify");
    console.error(
      "Or set CLAWQL_OPENBENCH=1 / CLAWQL_HARNESS_ALLOW_UNSANDBOXED=1 for bench lanes."
    );
    emitBenchJson({
      completed: false,
      error: gate.error ?? "sandbox gate failed",
      tokens: null,
      turns: null,
      exit_code: 1,
    });
    return {
      exitCode: 1,
      completed: false,
      error: gate.error ?? "sandbox gate failed",
      outputTail: "",
      fullOutput: "",
      cmd: [],
      usage: emptyUsage(),
    };
  }

  const forwarded = buildHeadlessArgv(id, instruction, workdir, opts.model, extraForwarded);
  const spawnBin = gate.ok && gate.wrap ? "/usr/bin/sandbox-exec" : bin;
  const spawnArgs = gate.ok && gate.wrap ? gate.sandboxArgv(bin, forwarded) : forwarded;

  const home = getClawqlHome();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CLAWQL_HOME: home,
    CLAWQL_OPENBENCH: "1",
  };
  if (!env.CLAWQL_OBSIDIAN_VAULT_PATH?.trim()) {
    env.CLAWQL_OBSIDIAN_VAULT_PATH = home;
  }
  if (!env.CLAWQL_ENABLE_MEMORY?.trim()) {
    env.CLAWQL_ENABLE_MEMORY = "1";
  }
  if (opts.inferenceUrl?.trim()) {
    const inferenceUrl = opts.inferenceUrl.trim().replace(/\/$/, "");
    const base = inferenceUrl.endsWith("/v1") ? inferenceUrl : `${inferenceUrl}/v1`;
    env.CLAWQL_INFERENCE_URL = base;
    env.OPENAI_BASE_URL = base;
    // OPENCODE_CONFIG_CONTENT replaces file config — always embed MCP + provider.
    if (id === "opencode" && opts.model?.trim()) {
      const gatewayModel = opts.model.trim().replace(/^clawql\//, "");
      env.OPENCODE_CONFIG_CONTENT = buildOpencodeConfigContent({
        inferenceUrl: base,
        gatewayModel,
        home,
      });
    }
  }

  const { code, stdout, stderr, timedOut } = await spawnCaptured(spawnBin, spawnArgs, {
    cwd: workdir,
    env,
    timeoutS: opts.timeoutS,
  });

  const combined = `${stdout}${stderr}`;
  const usage = parseHarnessUsage(id, stdout);
  const completed = code === 0 && !timedOut;
  const error = timedOut
    ? `timeout after ${opts.timeoutS ?? "?"}s`
    : completed
      ? null
      : `exit ${code}`;

  if (opts.writeTokenUsage !== false) {
    const payload = {
      tokens: usage.tokens,
      turns: usage.turns,
      tokens_input_uncached: usage.tokensInputUncached,
      tokens_output: usage.tokensOutput,
      token_basis: usage.tokenBasis,
      harness: id,
      completed,
    };
    try {
      await writeFile(
        join(workdir, ".token_usage"),
        `${JSON.stringify(payload, null, 2)}\n`,
        "utf8"
      );
    } catch {
      // non-fatal for the agent run itself
    }
  }

  // Forward harness JSONL so OpenBench agent-logs capture tool calls (MCP, edit, …).
  if (process.env.CLAWQL_OPENBENCH === "1" && combined.trim()) {
    process.stdout.write(combined.endsWith("\n") ? combined : `${combined}\n`);
  }
  try {
    await writeFile(join(workdir, ".openbench_harness.jsonl"), combined, "utf8");
  } catch {
    // non-fatal
  }

  // Machine-readable lines for OpenBench adapters / logs.
  if (usage.tokens !== null) console.log(`CLAWQL_TOKENS: ${usage.tokens}`);
  if (usage.turns !== null) console.log(`CLAWQL_TURNS: ${usage.turns}`);
  emitBenchJson({
    completed,
    error,
    tokens: usage.tokens,
    turns: usage.turns,
    tokens_input_uncached: usage.tokensInputUncached,
    tokens_output: usage.tokensOutput,
    token_basis: usage.tokenBasis,
    cmd: [spawnBin, ...spawnArgs].join(" "),
    exit_code: code,
  });

  return {
    exitCode: code,
    completed,
    error,
    outputTail: combined.slice(-2000),
    fullOutput: combined,
    cmd: [spawnBin, ...spawnArgs],
    usage,
  };
}
