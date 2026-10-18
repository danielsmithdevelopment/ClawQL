/**
 * Runtime preference ladder (product default):
 *   celld → (install prompt) → Bun → (install prompt) → Node (legacy) + improve message
 *
 * Interactive prompts live in the CLI (`clawql doctor`); this module is Effect-first
 * decision + messaging. Env refuse flags: CLAWQL_DECLINE_CELLD / CLAWQL_DECLINE_BUN.
 */

import { Context, Effect, Layer } from "effect";
import { spawnSync } from "node:child_process";
import {
  CELLD_PINNED_VERSION,
  celldPinStatusEffect,
  defaultCelldBinaryProbe,
  type CelldBinaryProbe,
} from "./celld-pin.js";
import { preferCoreInCelld } from "./core-celld-proxy.js";

export type RuntimeTier = "celld" | "bun" | "node";

export type RuntimeBinaryProbeResult = {
  readonly present: boolean;
  readonly version: string | null;
  readonly path: string | null;
};

export type RuntimeBinaryProbe = () => Effect.Effect<RuntimeBinaryProbeResult>;

export type RuntimeLadderInput = {
  readonly celldPresent: boolean;
  readonly celldVersion: string | null;
  readonly bunPresent: boolean;
  readonly bunVersion: string | null;
  /** Explicit refuse / CORE_IN_CELLD=0 / FORCE_HOST_CORE */
  readonly celldDeclined: boolean;
  readonly bunDeclined: boolean;
};

export type RuntimeLadderDecision = {
  readonly tier: RuntimeTier;
  readonly celldPresent: boolean;
  readonly bunPresent: boolean;
  readonly celldDeclined: boolean;
  readonly bunDeclined: boolean;
  /** Human-facing lines (install prompts, refuse acks, Node improve hint). */
  readonly messages: readonly string[];
  readonly installCelldHint: string;
  readonly installBunHint: string;
  readonly honesty: string;
};

export const INSTALL_CELLD_HINT =
  `Install celld ${CELLD_PINNED_VERSION}: clawql streams celld install` +
  `  (or CELLD_VERSION=${CELLD_PINNED_VERSION} curl -fsSL https://celld.dev/install.sh | sh)`;

export const INSTALL_BUN_HINT =
  "Install Bun: curl -fsSL https://bun.sh/install | bash  (then: bun run bin/clawql-mcp-http.mjs)";

export const NODE_IMPROVE_HINT =
  "On Node (legacy host). You can improve isolation and performance with the preceding " +
  "options: install celld (CoreToolsDO / Durable Object isolation) and/or install Bun " +
  "(`bun run bin/clawql-mcp-http.mjs` — equal-arm boards: ~22–28% lower RSS, ~25%+ better p50 vs Node).";

function envFlag(name: string, env: NodeJS.ProcessEnv): boolean {
  const v = env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function celldDeclinedFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  if (envFlag("CLAWQL_DECLINE_CELLD", env)) return true;
  if (envFlag("CLAWQL_FORCE_HOST_CORE", env) || envFlag("CLAWQL_FORCE_NODE_CORE", env)) {
    return true;
  }
  // Explicit CORE_IN_CELLD=0 means refuse celld for Core path.
  if (env.CLAWQL_CORE_IN_CELLD !== undefined && env.CLAWQL_CORE_IN_CELLD !== "") {
    return !preferCoreInCelld(env);
  }
  return false;
}

export function bunDeclinedFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return envFlag("CLAWQL_DECLINE_BUN", env) || envFlag("CLAWQL_FORCE_NODE_CORE", env);
}

export function defaultBunBinaryProbe(): RuntimeBinaryProbe {
  return () =>
    Effect.sync(() => {
      const res = spawnSync("bun", ["--version"], { encoding: "utf8" });
      if (res.status !== 0) {
        return { present: false, version: null, path: null };
      }
      const version = (res.stdout || "").trim().split(/\s+/)[0] || null;
      return { present: true, version, path: "bun" };
    });
}

/**
 * Pure decision from probed/refuse inputs (unit-testable).
 */
export function decideRuntimeLadder(input: RuntimeLadderInput): RuntimeLadderDecision {
  const messages: string[] = [];
  const { celldPresent, bunPresent, celldDeclined, bunDeclined } = input;

  // 1) celld
  if (!celldDeclined && celldPresent) {
    return {
      tier: "celld",
      celldPresent,
      bunPresent,
      celldDeclined,
      bunDeclined,
      messages: [
        `Runtime ladder: celld (${input.celldVersion ?? "on PATH"}) — preferred Core/isolation path`,
      ],
      installCelldHint: INSTALL_CELLD_HINT,
      installBunHint: INSTALL_BUN_HINT,
      honesty: "tier=celld (default)",
    };
  }

  if (!celldDeclined && !celldPresent) {
    messages.push(
      "Runtime ladder: celld not found — install for Durable Object isolation + CoreToolsDO."
    );
    messages.push(INSTALL_CELLD_HINT);
    messages.push(
      "Run `clawql doctor` to install, or set CLAWQL_DECLINE_CELLD=1 to refuse and continue on Bun."
    );
  } else if (celldDeclined) {
    messages.push(
      "Runtime ladder: celld declined — continuing to Bun host MCP."
    );
  }

  // 2) Bun
  if (!bunDeclined && bunPresent) {
    messages.push(
      `Runtime ladder: Bun (${input.bunVersion ?? "on PATH"}) — preferred host MCP when celld unavailable/declined`
    );
    return {
      tier: "bun",
      celldPresent,
      bunPresent,
      // Keep explicit refuse separate from "missing" so doctor can still prompt install.
      celldDeclined,
      bunDeclined,
      messages,
      installCelldHint: INSTALL_CELLD_HINT,
      installBunHint: INSTALL_BUN_HINT,
      honesty: celldDeclined
        ? "tier=bun (celld declined)"
        : "tier=bun (celld missing — install recommended)",
    };
  }

  if (!bunDeclined && !bunPresent) {
    messages.push(
      "Runtime ladder: Bun not found — install for better host RSS/latency vs Node."
    );
    messages.push(INSTALL_BUN_HINT);
    messages.push(
      "Run `clawql doctor` to install, or set CLAWQL_DECLINE_BUN=1 to refuse and continue on Node."
    );
  } else if (bunDeclined) {
    messages.push("Runtime ladder: Bun declined — continuing to Node (legacy).");
  }

  // 3) Node legacy
  messages.push(NODE_IMPROVE_HINT);
  return {
    tier: "node",
    celldPresent,
    bunPresent,
    celldDeclined,
    bunDeclined,
    messages,
    installCelldHint: INSTALL_CELLD_HINT,
    installBunHint: INSTALL_BUN_HINT,
    honesty: "tier=node (legacy — celld and Bun missing or declined)",
  };
}

export function resolveRuntimeLadderEffect(
  env: NodeJS.ProcessEnv = process.env,
  celldProbe: CelldBinaryProbe = defaultCelldBinaryProbe(env),
  bunProbe: RuntimeBinaryProbe = defaultBunBinaryProbe()
): Effect.Effect<RuntimeLadderDecision> {
  return Effect.gen(function* () {
    const pin = yield* celldPinStatusEffect(env, celldProbe);
    const bun = yield* bunProbe();
    return decideRuntimeLadder({
      celldPresent: pin.binaryPresent,
      celldVersion: pin.binaryVersion,
      bunPresent: bun.present,
      bunVersion: bun.version,
      celldDeclined: celldDeclinedFromEnv(env),
      bunDeclined: bunDeclinedFromEnv(env),
    });
  });
}

export class RuntimePreferenceLadderService extends Context.Service<
  RuntimePreferenceLadderService,
  {
    readonly resolve: () => Effect.Effect<RuntimeLadderDecision>;
  }
>()("clawql/RuntimePreferenceLadderService") {}

export function runtimePreferenceLadderLayer(
  env: NodeJS.ProcessEnv = process.env,
  celldProbe: CelldBinaryProbe = defaultCelldBinaryProbe(env),
  bunProbe: RuntimeBinaryProbe = defaultBunBinaryProbe()
): Layer.Layer<RuntimePreferenceLadderService> {
  return Layer.succeed(
    RuntimePreferenceLadderService,
    RuntimePreferenceLadderService.of({
      resolve: () => resolveRuntimeLadderEffect(env, celldProbe, bunProbe),
    })
  );
}

export function formatRuntimeLadderForLog(decision: RuntimeLadderDecision): string {
  return [`[clawql-runtime] ${decision.honesty}`, ...decision.messages.map((m) => `[clawql-runtime] ${m}`)].join(
    "\n"
  );
}
