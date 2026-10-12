/**
 * Plain proxy mode (ADR 0015) — key-group / flag gated `proxy_call` alias of execute.
 *
 * Spec: docs/specs/mcp/plain-proxy-mode-v0.1.md
 */

import { Context, Effect, Layer } from "effect";

function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

/** Parse comma-separated key-group allowlist (trim, drop empties, lowercase). */
export function parsePlainProxyKeyGroups(raw: string | undefined): ReadonlySet<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Whether the Core `proxy_call` MCP tool should register.
 *
 * On when `CLAWQL_ENABLE_PLAIN_PROXY` is truthy, or when the authenticated key’s
 * group (`CLAWQL_API_KEY_GROUP`) is listed in `CLAWQL_PLAIN_PROXY_KEY_GROUPS`.
 */
export function plainProxyEnabledEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> {
  return Effect.sync(() => {
    if (envTruthy(env.CLAWQL_ENABLE_PLAIN_PROXY)) return true;
    const allow = parsePlainProxyKeyGroups(env.CLAWQL_PLAIN_PROXY_KEY_GROUPS);
    if (allow.size === 0) return false;
    const group = env.CLAWQL_API_KEY_GROUP?.trim().toLowerCase();
    if (!group) return false;
    return allow.has(group);
  });
}

export function plainProxyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Effect.runSync(plainProxyEnabledEffect(env));
}

export class PlainProxyService extends Context.Service<
  PlainProxyService,
  {
    readonly enabled: (env?: NodeJS.ProcessEnv) => Effect.Effect<boolean>;
  }
>()("clawql/PlainProxyService") {}

export const PlainProxyLive = Layer.succeed(
  PlainProxyService,
  PlainProxyService.of({
    enabled: (env) => plainProxyEnabledEffect(env),
  })
);
