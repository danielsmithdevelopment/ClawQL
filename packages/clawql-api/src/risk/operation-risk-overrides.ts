/**
 * Load ~/.ClawQL/operation-risk.json (trusted MCP sources + per-op overrides).
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { resolveClawqlHome } from "../spec/custom-sources-store.js";
import {
  emptyOperationRiskConfig,
  type OperationRiskConfigFile,
  type OperationRiskOverride,
  type OperationRiskPolicy,
} from "./operation-risk-types.js";

const POLICIES = new Set<OperationRiskPolicy>(["allow", "mandate", "block"]);

export function getOperationRiskConfigPath(home = resolveClawqlHome()): string {
  return join(home, "operation-risk.json");
}

function parseOverride(v: unknown): OperationRiskOverride | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.policy !== "string" || !POLICIES.has(o.policy as OperationRiskPolicy)) return null;
  if (typeof o.reason !== "string" || o.reason.trim().length === 0) return null;
  const level =
    o.level === "LOW" || o.level === "MEDIUM" || o.level === "HIGH" ? o.level : undefined;
  return {
    policy: o.policy as OperationRiskPolicy,
    ...(level ? { level } : {}),
    reason: o.reason.trim(),
  };
}

export function parseOperationRiskConfig(raw: unknown): OperationRiskConfigFile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyOperationRiskConfig();
  }
  const o = raw as Record<string, unknown>;
  const trusted = Array.isArray(o.trustedMcpSources)
    ? o.trustedMcpSources.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
  const overridesIn =
    o.overrides && typeof o.overrides === "object" && !Array.isArray(o.overrides)
      ? (o.overrides as Record<string, unknown>)
      : {};
  const overrides: Record<string, OperationRiskOverride> = {};
  for (const [id, val] of Object.entries(overridesIn)) {
    const parsed = parseOverride(val);
    if (parsed) overrides[id] = parsed;
  }
  return {
    version: 1,
    trustedMcpSources: trusted,
    overrides,
  };
}

/** Env list merges with file trusted ids. */
export const trustedMcpSourcesFromEnvEffect = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<readonly string[]> =>
  Effect.sync(() => {
    const raw = env.CLAWQL_MCP_TRUSTED_SOURCES?.trim();
    if (!raw) return [];
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  });

export const readOperationRiskConfigEffect = (
  home = resolveClawqlHome()
): Effect.Effect<OperationRiskConfigFile, Error> =>
  Effect.tryPromise({
    try: async () => {
      const path = getOperationRiskConfigPath(home);
      try {
        const text = await readFile(path, "utf8");
        return parseOperationRiskConfig(JSON.parse(text) as unknown);
      } catch (e: unknown) {
        const code = (e as NodeJS.ErrnoException)?.code;
        if (code === "ENOENT") return emptyOperationRiskConfig();
        throw e;
      }
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

export async function readOperationRiskConfig(
  home = resolveClawqlHome()
): Promise<OperationRiskConfigFile> {
  return Effect.runPromise(readOperationRiskConfigEffect(home));
}
