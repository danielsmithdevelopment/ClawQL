import { Effect } from "effect";
import { mkdir, copyFile, writeFile, access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { CLINE_ATR_TEMPLATES } from "../adapters/cline/atr-templates.js";
import { HERMES_ATR_TEMPLATES } from "../adapters/hermes/atr-templates.js";
import { buildClineMcpBridge } from "../adapters/cline/mcp-bridge.js";
import { hermesRuntimeClassHint } from "../adapters/hermes/mcp-bridge.js";

/** Locate packages/clawql-agents without import.meta (CJS-safe). */
export const resolveClawqlAgentsPackageRoot = (): Effect.Effect<string, Error> =>
  Effect.tryPromise({
    try: async () => {
      const start = process.env.CLAWQL_AGENTS_PACKAGE_ROOT?.trim();
      if (start) return start;
      let dir = process.cwd();
      for (let i = 0; i < 8; i++) {
        const direct = join(dir, "package.json");
        try {
          const raw = await readFile(direct, "utf8");
          const pkg = JSON.parse(raw) as { name?: string };
          if (pkg.name === "clawql-agents") return dir;
        } catch {
          /* continue */
        }
        const nested = join(dir, "packages/clawql-agents/package.json");
        try {
          const raw = await readFile(nested, "utf8");
          const pkg = JSON.parse(raw) as { name?: string };
          if (pkg.name === "clawql-agents") return join(dir, "packages/clawql-agents");
        } catch {
          /* continue */
        }
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
      throw new Error("Could not locate clawql-agents package root");
    },
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });

export type PersonalAgentInstallPaths = {
  readonly hermesExtensionsDir: string;
  readonly clineConfigPath: string;
  readonly mcpEndpoint: string;
  readonly inferenceEndpoint: string;
  readonly wormHttpEndpoint?: string;
};

export type PersonalAgentInstallPlan = {
  readonly hermesWormAgentDest: string;
  readonly hermesYamlSnippet: string;
  readonly clineConfig: Record<string, unknown>;
  readonly atr: {
    readonly hermes: typeof HERMES_ATR_TEMPLATES.orchestrator;
    readonly cline: typeof CLINE_ATR_TEMPLATES.execution_worker;
  };
  readonly envHints: Record<string, string>;
};

/** Build install artifacts for Hermes WORM agent + Cline MCP/hooks (no side effects). */
export const planPersonalAgentInstall = (
  paths: PersonalAgentInstallPaths
): Effect.Effect<PersonalAgentInstallPlan> =>
  Effect.gen(function* () {
    const mcp = yield* buildClineMcpBridge(paths.mcpEndpoint, CLINE_ATR_TEMPLATES.execution_worker);
    const runtimeClass = yield* hermesRuntimeClassHint(
      join(paths.hermesExtensionsDir, "worm_agent")
    );
    return {
      hermesWormAgentDest: join(paths.hermesExtensionsDir, "worm_agent.py"),
      hermesYamlSnippet: [
        "agent:",
        `  runtime_class: "${runtimeClass}"`,
        "",
        "# ATR (operator / Panguard JWT claims) — Hermes orchestrator:",
        `# tools: ${HERMES_ATR_TEMPLATES.orchestrator.toolsInScope.join(", ")}`,
      ].join("\n"),
      clineConfig: {
        mcp: {
          servers: [
            {
              name: mcp.mcpServers.clawql.name,
              url: mcp.mcpServers.clawql.url,
              enabled: true,
            },
          ],
        },
        model: {
          provider: "openai-compatible",
          baseUrl: paths.inferenceEndpoint,
          apiKey: "local",
          modelId: "openai/ornith-1.5-35b-a3b",
        },
        hooks: {
          file: join(dirname(paths.clineConfigPath), "hooks", "worm-instrumentation.mjs"),
        },
        atrScopeHint: mcp.atrScopeHint,
      },
      atr: {
        hermes: HERMES_ATR_TEMPLATES.orchestrator,
        cline: CLINE_ATR_TEMPLATES.execution_worker,
      },
      envHints: {
        WORM_HTTP_ENDPOINT: paths.wormHttpEndpoint ?? "http://127.0.0.1:9000/clawql-worm-personal",
        CLAWQL_MCP_URL: paths.mcpEndpoint,
        CLAWQL_INFERENCE_URL: paths.inferenceEndpoint,
      },
    };
  });

/**
 * Materialize Hermes worm_agent.py + Cline config/hooks under operator paths.
 * Safe to re-run (overwrites generated files).
 */
export const installPersonalAgentHooks = (
  paths: PersonalAgentInstallPaths
): Effect.Effect<PersonalAgentInstallPlan, Error> =>
  Effect.gen(function* () {
    const plan = yield* planPersonalAgentInstall(paths);
    const root = yield* resolveClawqlAgentsPackageRoot();
    const srcPy = join(root, "python/hermes/worm_agent.py");
    yield* Effect.tryPromise({
      try: async () => {
        await access(srcPy, constants.R_OK);
        await mkdir(paths.hermesExtensionsDir, { recursive: true });
        await copyFile(srcPy, plan.hermesWormAgentDest);
        await mkdir(dirname(paths.clineConfigPath), { recursive: true });
        await writeFile(paths.clineConfigPath, `${JSON.stringify(plan.clineConfig, null, 2)}\n`);
        const hooksDir = join(dirname(paths.clineConfigPath), "hooks");
        await mkdir(hooksDir, { recursive: true });
        const hookDest = join(hooksDir, "worm-instrumentation.mjs");
        await writeFile(hookDest, CLINE_WORM_HOOK_STUB);
        await writeFile(
          join(paths.hermesExtensionsDir, "hermes.runtime.snippet.yaml"),
          `${plan.hermesYamlSnippet}\n`
        );
      },
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    });
    return plan;
  });

/** Minimal Cline hook stub that POSTs WORM-shaped events to WORM_HTTP_ENDPOINT. */
export const CLINE_WORM_HOOK_STUB = `/** Generated by clawql-agents personal install — thin WORM POST façade. */
export async function beforeFileWrite(ctx) {
  await append("FILE_WRITE", { path: ctx.path, phase: "before" });
}
export async function afterFileWrite(ctx) {
  await append("FILE_WRITE", { path: ctx.path, success: ctx.success, phase: "after" });
}
export async function beforeTerminalExec(ctx) {
  await append("TERMINAL_EXEC", { command: ctx.command, cwd: ctx.cwd, phase: "before" });
}
export async function afterTerminalExec(ctx) {
  await append("TERMINAL_EXEC", { command: ctx.command, exitCode: ctx.exitCode, phase: "after" });
}
export async function onSessionStart(ctx) {
  await append("SESSION_START", { sessionId: ctx.sessionId });
}
export async function onSessionEnd(ctx) {
  await append("SESSION_END", { sessionId: ctx.sessionId });
}
async function append(kind, detail) {
  const endpoint = process.env.WORM_HTTP_ENDPOINT;
  if (!endpoint) return;
  const body = JSON.stringify({
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    agent: "cline",
    kind,
    detail,
  });
  try {
    await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  } catch {
    /* best-effort */
  }
}
`;
