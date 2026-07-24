/**
 * `clawql gateway` — Managed Edge Gateway create / status / destroy.
 *
 * Materializes MCP (/mcp) + inference (/v1) + vault memory with secure defaults
 * (virtual key required; no noAuth on networked surfaces).
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, openSync } from "node:fs";
import { chmod, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createVirtualKey } from "clawql-inference";
import { getClawqlHome } from "./paths.js";

export type GatewayProfile = "process" | "local-docker";

export type GatewayCliOptions = {
  profile?: GatewayProfile;
  team?: string;
  port?: number;
  home?: string;
  noStart?: boolean;
  yes?: boolean;
  json?: boolean;
  label?: string;
  budgetUsd?: number;
  rateLimit?: string;
};

export type ManagedGatewayState = {
  version: 1;
  profile: GatewayProfile;
  team: string;
  port: number;
  home: string;
  virtualKeyId: string;
  createdAt: string;
  urls: {
    gateway: string;
    mcp: string;
    inference: string;
    healthz: string;
  };
  pids?: {
    mcp?: number;
    inference?: number;
    proxy?: number;
  };
};

function managedDir(home: string): string {
  return join(home, "ManagedGateway");
}

function statePath(home: string): string {
  return join(managedDir(home), "gateway.json");
}

function secretEnvPath(home: string): string {
  return join(managedDir(home), "secret.env");
}

function findRepoRoot(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, "examples", "managed-gateway", "docker-compose.yml"))) {
      return dir;
    }
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, "examples"))) {
      // Prefer repo with managed-gateway example when present
      if (existsSync(join(dir, "examples", "managed-gateway"))) return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function managedExampleDir(repoRoot: string): string {
  return join(repoRoot, "examples", "managed-gateway");
}

async function waitForPortFree(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once("error", () => resolvePromise(false));
    server.once("listening", () => {
      server.close(() => resolvePromise(true));
    });
    server.listen(port, host);
  });
}

async function waitForHealth(url: string, timeoutMs = 60_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function writeSecureFile(path: string, contents: string): Promise<void> {
  await writeFile(path, contents, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

export async function loadManagedGatewayState(
  home = getClawqlHome()
): Promise<ManagedGatewayState | null> {
  const path = statePath(home);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as ManagedGatewayState;
    if (raw?.version !== 1) return null;
    return raw;
  } catch {
    return null;
  }
}

function buildUrls(port: number) {
  const gateway = `http://127.0.0.1:${port}`;
  return {
    gateway,
    mcp: `${gateway}/mcp`,
    inference: `${gateway}/v1`,
    healthz: `${gateway}/healthz`,
  };
}

export async function materializeManagedGateway(options: {
  home: string;
  team: string;
  port: number;
  profile: GatewayProfile;
  label?: string;
  budgetUsd?: number;
  rateLimit?: string;
}): Promise<{ state: ManagedGatewayState; secret: string; repoRoot: string | null }> {
  const home = resolve(options.home);
  const mgDir = managedDir(home);
  const inferenceDir = join(home, "Inference");
  const memoryDir = join(home, "Memory");
  await mkdir(mgDir, { recursive: true });
  await mkdir(inferenceDir, { recursive: true });
  await mkdir(memoryDir, { recursive: true });
  await mkdir(join(home, "vault"), { recursive: true });

  const repoRoot = findRepoRoot();
  const policySrc = repoRoot ? join(managedExampleDir(repoRoot), "policy.yaml") : null;
  const policyDst = join(inferenceDir, "policy.yaml");
  if (policySrc && existsSync(policySrc)) {
    await copyFile(policySrc, policyDst);
  } else if (!existsSync(policyDst)) {
    await writeFile(
      policyDst,
      `policyVersion: "2026.07.01"\ninference:\n  keys:\n    enabled: true\n  store:\n    backend: jsonl\n`,
      "utf8"
    );
  }

  const envForKeys: NodeJS.ProcessEnv = {
    ...process.env,
    CLAWQL_HOME: home,
    CLAWQL_INFERENCE_KEYS_ENABLED: "1",
  };
  const created = await createVirtualKey(
    {
      team: options.team,
      label: options.label ?? "managed-edge-gateway",
      budgetUsd: options.budgetUsd,
      rateLimit: options.rateLimit,
    },
    envForKeys
  );

  const urls = buildUrls(options.port);
  const state: ManagedGatewayState = {
    version: 1,
    profile: options.profile,
    team: options.team,
    port: options.port,
    home,
    virtualKeyId: created.key.id,
    createdAt: new Date().toISOString(),
    urls,
  };

  await writeFile(statePath(home), JSON.stringify(state, null, 2) + "\n", "utf8");
  await writeSecureFile(
    secretEnvPath(home),
    [
      `# Managed Edge Gateway secrets — do not commit`,
      `CLAWQL_HOME=${home}`,
      `CLAWQL_OBSIDIAN_VAULT_PATH=${home}`,
      `CLAWQL_API_KEY=${created.secret}`,
      `CLAWQL_AUTH_MODE=apiKey`,
      `CLAWQL_INFERENCE_KEYS_ENABLED=1`,
      `CLAWQL_INFERENCE_POLICY_MANIFEST=${policyDst}`,
      `CLAWQL_GATEWAY_PORT=${options.port}`,
      "",
    ].join("\n")
  );

  if (repoRoot) {
    const exampleDir = managedExampleDir(repoRoot);
    const composeEnv = join(exampleDir, ".env");
    const dataHome = join(exampleDir, "data", "clawql-home");
    const dataVault = join(exampleDir, "data", "vault");
    await mkdir(dataHome, { recursive: true });
    await mkdir(join(dataHome, "Inference"), { recursive: true });
    await mkdir(dataVault, { recursive: true });
    await mkdir(join(dataVault, "Memory"), { recursive: true });
    await copyFile(policyDst, join(dataHome, "Inference", "policy.yaml"));
    // Mirror virtual keys into compose home mount
    const vkSrc = join(home, "Inference", "virtual-keys.json");
    if (existsSync(vkSrc)) {
      await copyFile(vkSrc, join(dataHome, "Inference", "virtual-keys.json"));
    }
    await writeSecureFile(
      composeEnv,
      [
        `CLAWQL_GATEWAY_PORT=${options.port}`,
        `CLAWQL_PROVIDER=default`,
        `CLAWQL_API_KEY=${created.secret}`,
        `CLAWQL_VAULT_HOST_PATH=${dataVault}`,
        `CLAWQL_HOME_HOST_PATH=${dataHome}`,
        `DEEPSEEK_API_KEY=${process.env.DEEPSEEK_API_KEY ?? ""}`,
        `GROQ_API_KEY=${process.env.GROQ_API_KEY ?? ""}`,
        `OPENAI_API_KEY=${process.env.OPENAI_API_KEY ?? ""}`,
        `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY ?? ""}`,
        `OPENROUTER_API_KEY=${process.env.OPENROUTER_API_KEY ?? ""}`,
        "",
      ].join("\n")
    );
  }

  return { state, secret: created.secret, repoRoot };
}

function spawnDetached(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  logPath: string
): ChildProcess {
  const out = openSync(logPath, "a");
  return spawn(command, args, {
    env,
    detached: true,
    stdio: ["ignore", out, out],
  });
}

async function startProcessProfile(
  state: ManagedGatewayState,
  secret: string,
  repoRoot: string
): Promise<ManagedGatewayState> {
  const home = state.home;
  const mgDir = managedDir(home);
  const mcpPort = state.port + 10000; // e.g. 18080 when gateway is 8080
  const inferencePort = state.port + 10001;
  const nodeBin = process.execPath;
  const mcpEntry = join(repoRoot, "dist", "server-http.js");
  const inferenceBin = join(
    repoRoot,
    "packages",
    "clawql-inference",
    "bin",
    "clawql-inference.mjs"
  );
  const proxyBin = join(repoRoot, "examples", "managed-gateway", "gateway-proxy.mjs");

  if (!existsSync(mcpEntry)) {
    throw new Error(`Missing ${mcpEntry} — run npm run build first`);
  }
  if (!existsSync(inferenceBin)) {
    throw new Error(`Missing ${inferenceBin}`);
  }

  const freeGateway = await waitForPortFree(state.port);
  if (!freeGateway) {
    throw new Error(`Port ${state.port} is already in use`);
  }

  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    CLAWQL_HOME: home,
    CLAWQL_OBSIDIAN_VAULT_PATH: home,
    CLAWQL_ENABLE_MEMORY: "1",
    CLAWQL_AUTH_MODE: "apiKey",
    CLAWQL_API_KEY: secret,
    CLAWQL_INFERENCE_KEYS_ENABLED: "1",
    CLAWQL_INFERENCE_POLICY_MANIFEST: join(home, "Inference", "policy.yaml"),
  };

  const mcp = spawnDetached(
    nodeBin,
    [mcpEntry],
    { ...baseEnv, PORT: String(mcpPort), MCP_PATH: "/mcp" },
    join(mgDir, "mcp.log")
  );
  const inference = spawnDetached(
    nodeBin,
    [inferenceBin],
    {
      ...baseEnv,
      CLAWQL_INFERENCE_PORT: String(inferencePort),
      CLAWQL_INFERENCE_HOST: "127.0.0.1",
    },
    join(mgDir, "inference.log")
  );
  const proxy = spawnDetached(
    nodeBin,
    [proxyBin],
    {
      ...baseEnv,
      CLAWQL_GATEWAY_PORT: String(state.port),
      CLAWQL_GATEWAY_HOST: "127.0.0.1",
      CLAWQL_MCP_UPSTREAM: `http://127.0.0.1:${mcpPort}`,
      CLAWQL_INFERENCE_UPSTREAM: `http://127.0.0.1:${inferencePort}`,
    },
    join(mgDir, "proxy.log")
  );

  mcp.unref();
  inference.unref();
  proxy.unref();

  const next: ManagedGatewayState = {
    ...state,
    pids: {
      mcp: mcp.pid,
      inference: inference.pid,
      proxy: proxy.pid,
    },
  };
  await writeFile(statePath(home), JSON.stringify(next, null, 2) + "\n", "utf8");

  const mcpHealth = `http://127.0.0.1:${mcpPort}/healthz`;
  const inferenceHealth = `http://127.0.0.1:${inferencePort}/healthz`;
  const [proxyOk, mcpOk, inferenceOk] = await Promise.all([
    waitForHealth(state.urls.healthz, 20_000),
    waitForHealth(mcpHealth, 120_000),
    waitForHealth(inferenceHealth, 45_000),
  ]);
  if (!proxyOk || !mcpOk || !inferenceOk) {
    throw new Error(
      `Gateway not fully healthy (proxy=${proxyOk}, mcp=${mcpOk}, inference=${inferenceOk}). Check ${mgDir}/*.log`
    );
  }
  return next;
}

async function startDockerProfile(repoRoot: string, port: number): Promise<void> {
  const exampleDir = managedExampleDir(repoRoot);
  const envFile = join(exampleDir, ".env");
  if (!existsSync(envFile)) {
    throw new Error(`Missing ${envFile} — create materials first`);
  }
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn("docker", ["compose", "--env-file", ".env", "up", "-d", "--build"], {
      cwd: exampleDir,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`docker compose exited ${code}`));
    });
  });
  const healthy = await waitForHealth(`http://127.0.0.1:${port}/healthz`, 180_000);
  if (!healthy) {
    throw new Error(`Docker gateway did not become healthy on :${port}`);
  }
}

function printCreateResult(state: ManagedGatewayState, secret: string, json: boolean): void {
  if (json) {
    console.log(
      JSON.stringify(
        {
          ...state,
          virtualKeySecret: secret,
          client: {
            OPENAI_BASE_URL: state.urls.inference,
            OPENAI_API_KEY: secret,
          },
        },
        null,
        2
      )
    );
    return;
  }

  console.log("ClawQL Managed Edge Gateway created");
  console.log("");
  console.log(`  Profile:       ${state.profile}`);
  console.log(`  Team:          ${state.team}`);
  console.log(`  MCP URL:       ${state.urls.mcp}`);
  console.log(`  Inference URL: ${state.urls.inference}`);
  console.log(`  Health:        ${state.urls.healthz}`);
  console.log("");
  console.log("Virtual key (shown once):");
  console.log(`  ${secret}`);
  console.log("");
  console.log("Client env:");
  console.log(`  export OPENAI_BASE_URL=${state.urls.inference}`);
  console.log(`  export OPENAI_API_KEY=${secret}`);
  console.log("");
  console.log("Security: CLAWQL_AUTH_MODE=apiKey · CLAWQL_INFERENCE_KEYS_ENABLED=1 · memory on");
  console.log(`State: ${statePath(state.home)}`);
}

export async function runGatewayCreate(options: GatewayCliOptions = {}): Promise<number> {
  const profile = options.profile ?? "process";
  if (profile !== "process" && profile !== "local-docker") {
    console.error("Usage: clawql gateway create --profile process|local-docker");
    return 1;
  }
  const team = options.team?.trim() || "default";
  const port = options.port && Number.isFinite(options.port) ? options.port : 8080;
  const home = options.home?.trim() ? resolve(options.home) : getClawqlHome();

  const existing = await loadManagedGatewayState(home);
  if (existing && !options.yes) {
    console.error(
      `Managed gateway already exists at ${statePath(home)}. Pass --yes to replace, or run: clawql gateway destroy --yes`
    );
    return 1;
  }
  if (existing) {
    await runGatewayDestroy({ home, yes: true, json: false });
  }

  try {
    const { state, secret, repoRoot } = await materializeManagedGateway({
      home,
      team,
      port,
      profile,
      label: options.label,
      budgetUsd: options.budgetUsd,
      rateLimit: options.rateLimit,
    });

    if (!options.noStart) {
      if (profile === "process") {
        if (!repoRoot) {
          console.error("Could not locate ClawQL repo root for process profile start.");
          console.error("Materials were written; start manually or use --profile local-docker.");
          printCreateResult(state, secret, Boolean(options.json));
          return 1;
        }
        const started = await startProcessProfile(state, secret, repoRoot);
        printCreateResult(started, secret, Boolean(options.json));
        return 0;
      }
      if (!repoRoot) {
        console.error("Could not locate examples/managed-gateway for Docker profile.");
        printCreateResult(state, secret, Boolean(options.json));
        return 1;
      }
      await startDockerProfile(repoRoot, port);
    }

    printCreateResult(state, secret, Boolean(options.json));
    if (options.noStart && profile === "local-docker" && repoRoot) {
      console.log("");
      console.log(
        `Start with: cd ${managedExampleDir(repoRoot)} && docker compose --env-file .env up -d --build`
      );
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export async function runGatewayStatus(options: GatewayCliOptions = {}): Promise<number> {
  const home = options.home?.trim() ? resolve(options.home) : getClawqlHome();
  const state = await loadManagedGatewayState(home);
  if (!state) {
    console.error(`No managed gateway state at ${statePath(home)}`);
    return 1;
  }

  let healthy = false;
  try {
    const res = await fetch(state.urls.healthz, { signal: AbortSignal.timeout(3000) });
    healthy = res.ok;
  } catch {
    healthy = false;
  }

  if (options.json) {
    console.log(JSON.stringify({ ...state, healthy }, null, 2));
    return healthy ? 0 : 2;
  }

  console.log(`profile: ${state.profile}`);
  console.log(`team: ${state.team}`);
  console.log(`healthy: ${healthy}`);
  console.log(`mcp: ${state.urls.mcp}`);
  console.log(`inference: ${state.urls.inference}`);
  console.log(`healthz: ${state.urls.healthz}`);
  console.log(`virtualKeyId: ${state.virtualKeyId}`);
  console.log(`home: ${state.home}`);
  return healthy ? 0 : 2;
}

function killPid(pid?: number): void {
  if (!pid || !Number.isFinite(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // already gone
  }
}

export async function runGatewayDestroy(options: GatewayCliOptions = {}): Promise<number> {
  if (!options.yes) {
    console.error("Usage: clawql gateway destroy --yes");
    return 1;
  }
  const home = options.home?.trim() ? resolve(options.home) : getClawqlHome();
  const state = await loadManagedGatewayState(home);
  const repoRoot = findRepoRoot();

  if (state?.profile === "process" && state.pids) {
    killPid(state.pids.proxy);
    killPid(state.pids.mcp);
    killPid(state.pids.inference);
  }

  if (state?.profile === "local-docker" && repoRoot) {
    const exampleDir = managedExampleDir(repoRoot);
    if (existsSync(join(exampleDir, "docker-compose.yml"))) {
      await new Promise<void>((resolvePromise) => {
        const child = spawn("docker", ["compose", "--env-file", ".env", "down"], {
          cwd: exampleDir,
          stdio: "ignore",
        });
        child.on("exit", () => resolvePromise());
        child.on("error", () => resolvePromise());
      });
    }
  }

  await rm(managedDir(home), { recursive: true, force: true });
  if (options.json) {
    console.log(JSON.stringify({ destroyed: true, home }, null, 2));
  } else {
    console.log(`Destroyed managed gateway materials under ${managedDir(home)}`);
  }
  return 0;
}
