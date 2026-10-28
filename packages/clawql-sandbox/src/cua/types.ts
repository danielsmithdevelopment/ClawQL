/**
 * Cua Spaces isolation backend config (ADR 0018).
 * Optional — never auto-selected unless CLAWQL_SANDBOX_CUA_* enables it.
 */

import { Effect } from "effect";
import type { IsolationTier } from "../isolation-backend/types.js";
import { PINNED_CUA_NPM_VERSION } from "./pinned-version.js";

export type CuaBackendMode = "mock" | "live";

export type CuaConfig = {
  readonly enabled: boolean;
  readonly mode: CuaBackendMode;
  /** Default tier when admit omits one. */
  readonly defaultTier: IsolationTier;
  /**
   * Live control-plane base URL (cua-spacesd / daemon MCP).
   * Live mode never vendors @trycua/cua into clawql-sandbox —
   * operators install the pinned peer separately.
   */
  readonly controlPlaneUrl?: string;
  readonly apiToken?: string;
  readonly pinnedNpmVersion: string;
  /**
   * Cua Spaces are Linux guests on a Mac host. Presence / approvals stay
   * on the host — never inject those services into the Space.
   */
  readonly keepPresenceAndApprovalsOnHost: true;
};

export function parseCuaTierEffect(raw: string | undefined): Effect.Effect<IsolationTier> {
  return Effect.sync(() => {
    const v = raw?.trim().toLowerCase();
    if (v === "microvm" || v === "micro-vm" || v === "uvm") return "microvm";
    if (v === "full-vm" || v === "fullvm" || v === "vm") return "full-vm";
    return "container";
  });
}

export function parseCuaTier(raw: string | undefined): IsolationTier {
  return Effect.runSync(parseCuaTierEffect(raw));
}

export function readCuaConfigEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<CuaConfig> {
  return Effect.gen(function* () {
    const enabledRaw = env.CLAWQL_SANDBOX_CUA_ENABLED?.trim().toLowerCase();
    const modeRaw = env.CLAWQL_SANDBOX_CUA_MODE?.trim().toLowerCase();
    const url = env.CLAWQL_SANDBOX_CUA_URL?.trim();
    const token = env.CLAWQL_SANDBOX_CUA_API_TOKEN?.trim();
    const mode: CuaBackendMode =
      modeRaw === "live" ? "live" : modeRaw === "mock" ? "mock" : url && token ? "live" : "mock";
    const enabledExplicit = enabledRaw === "1" || enabledRaw === "true" || enabledRaw === "yes";
    const enabledDisabled = enabledRaw === "0" || enabledRaw === "false" || enabledRaw === "no";
    const enabled = enabledDisabled
      ? false
      : enabledExplicit || mode === "live" || modeRaw === "mock";
    const defaultTier = yield* parseCuaTierEffect(env.CLAWQL_SANDBOX_CUA_DEFAULT_TIER);
    return {
      enabled,
      mode,
      defaultTier,
      controlPlaneUrl: url || undefined,
      apiToken: token || undefined,
      pinnedNpmVersion: env.CLAWQL_SANDBOX_CUA_PINNED_VERSION?.trim() || PINNED_CUA_NPM_VERSION,
      keepPresenceAndApprovalsOnHost: true,
    } satisfies CuaConfig;
  });
}

export function readCuaConfig(env?: NodeJS.ProcessEnv): CuaConfig {
  return Effect.runSync(readCuaConfigEffect(env));
}

export function cuaConfiguredEffect(env: NodeJS.ProcessEnv = process.env): Effect.Effect<boolean> {
  return Effect.gen(function* () {
    const cfg = yield* readCuaConfigEffect(env);
    if (!cfg.enabled) return false;
    if (cfg.mode === "mock") return true;
    return Boolean(cfg.controlPlaneUrl && cfg.apiToken);
  });
}

export function cuaConfigured(env?: NodeJS.ProcessEnv): boolean {
  return Effect.runSync(cuaConfiguredEffect(env));
}
