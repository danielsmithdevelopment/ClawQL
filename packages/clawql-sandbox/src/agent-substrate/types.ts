/**
 * Agent Substrate isolation backend (ADR 0011).
 * Operator chooses Cloud Hypervisor microVM or gVisor.
 */

import type { SandboxCodeToolInput } from "../types.js";

export type AgentSubstrateRuntime = "cloud-hypervisor" | "gvisor";

export type AgentSubstrateSessionState = "running" | "suspended" | "terminated";

export type AgentSubstrateSession = {
  readonly sessionId: string;
  readonly runtime: AgentSubstrateRuntime;
  readonly state: AgentSubstrateSessionState;
  readonly createdAt: string;
  readonly lastTransitionAt: string;
};

export type AgentSubstrateExecResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly success: boolean;
  readonly sessionId: string;
  readonly runtime: AgentSubstrateRuntime;
  readonly resumedFromSuspend: boolean;
};

export type AgentSubstrateConfig = {
  readonly enabled: boolean;
  readonly runtime: AgentSubstrateRuntime;
  /** Control-plane base URL (K8s API proxy or Agent Substrate service). */
  readonly controlPlaneUrl?: string;
  readonly apiToken?: string;
  /**
   * `mock` — in-process for tests/dev without cluster.
   * `live` — call control plane (requires URL + token).
   */
  readonly mode: "mock" | "live";
  /**
   * Production customer path requires explicit operator confirmation
   * (Agent Substrate production GA is allowlist-based — ADR 0011 §5).
   */
  readonly allowProduction: boolean;
};

export function parseAgentSubstrateRuntime(raw: string | undefined): AgentSubstrateRuntime {
  const v = raw?.trim().toLowerCase();
  if (v === "gvisor" || v === "g-visor" || v === "runsc") return "gvisor";
  return "cloud-hypervisor";
}

export function readAgentSubstrateConfig(
  env: NodeJS.ProcessEnv = process.env
): AgentSubstrateConfig {
  const enabledRaw = env.CLAWQL_SANDBOX_AGENT_SUBSTRATE_ENABLED?.trim().toLowerCase();
  const modeRaw = env.CLAWQL_SANDBOX_AGENT_SUBSTRATE_MODE?.trim().toLowerCase();
  const url = env.CLAWQL_SANDBOX_AGENT_SUBSTRATE_URL?.trim();
  const token = env.CLAWQL_SANDBOX_AGENT_SUBSTRATE_API_TOKEN?.trim();
  const mode: "mock" | "live" =
    modeRaw === "live" ? "live" : modeRaw === "mock" ? "mock" : url && token ? "live" : "mock";

  const enabledExplicit = enabledRaw === "1" || enabledRaw === "true" || enabledRaw === "yes";
  const enabledDisabled = enabledRaw === "0" || enabledRaw === "false" || enabledRaw === "no";
  const enabled = enabledDisabled
    ? false
    : enabledExplicit || mode === "live" || modeRaw === "mock";

  return {
    enabled,
    runtime: parseAgentSubstrateRuntime(env.CLAWQL_SANDBOX_AGENT_SUBSTRATE_RUNTIME),
    controlPlaneUrl: url || undefined,
    apiToken: token || undefined,
    mode,
    allowProduction:
      env.CLAWQL_SANDBOX_AGENT_SUBSTRATE_ALLOW_PRODUCTION?.trim() === "1" ||
      env.CLAWQL_SANDBOX_AGENT_SUBSTRATE_ALLOW_PRODUCTION?.trim().toLowerCase() === "true",
  };
}

/** True when Agent Substrate should be considered in auto-selection. */
export function agentSubstrateConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const cfg = readAgentSubstrateConfig(env);
  if (!cfg.enabled) return false;
  if (cfg.mode === "mock") return true;
  return Boolean(cfg.controlPlaneUrl && cfg.apiToken);
}

export type AgentSubstrateLifecycleEvent =
  | { readonly kind: "session_created"; readonly session: AgentSubstrateSession }
  | { readonly kind: "session_suspended"; readonly session: AgentSubstrateSession }
  | { readonly kind: "session_resumed"; readonly session: AgentSubstrateSession }
  | { readonly kind: "session_terminated"; readonly session: AgentSubstrateSession }
  | {
      readonly kind: "exec_completed";
      readonly sessionId: string;
      readonly input: Pick<SandboxCodeToolInput, "language" | "sessionId">;
      readonly result: AgentSubstrateExecResult;
    };
