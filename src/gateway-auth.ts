/**
 * Gateway auth composition for HTTP MCP — uses createClawQLAuth with WORM authEventSink.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  createClawQLAuth,
  loadGatewayAuthConfig,
  type ApiKeyClaimsResolver,
  type AtrClaims,
  type ClawQLAuth,
  type GatewayAuthConfig,
} from "clawql-auth";
import { Effect } from "effect";
import { validateVirtualKey } from "clawql-inference";
import { getProcessWormAuthEventSink } from "./process-worm-host.js";

let gatewayAuth: ClawQLAuth | undefined;

/**
 * Map clawql-inference virtual keys to ATR claims (tenantId = key.team).
 * Returns null when the secret is not a known virtual key so static CLAWQL_API_KEY can apply.
 */
export function createInferenceVirtualKeyClaimsResolver(
  env: NodeJS.ProcessEnv = process.env
): ApiKeyClaimsResolver {
  return (presented) => {
    const result = validateVirtualKey(presented, env);
    if (!result.ok) {
      if (result.status === 402 || result.status === 429) {
        return { ok: false, error: result.message };
      }
      return null;
    }
    return {
      ok: true,
      claims: {
        sub: result.context.id,
        role: "operator",
        scope: ["execute", "search", "memory"],
        tenantId: result.context.team,
        virtualKeyId: result.context.id,
      },
    };
  };
}

function resolveIssuedApiKeyStorePath(env: NodeJS.ProcessEnv): string | undefined {
  const explicit =
    env.CLAWQL_AUTH_API_KEY_STORE_PATH?.trim() ?? env.CLAWQL_API_KEYS_PATH?.trim();
  if (explicit) return explicit;
  if (env.CLAWQL_AUTH_ISSUED_API_KEYS?.trim() === "1") {
    const home = env.CLAWQL_HOME?.trim();
    if (home) return join(home, "Auth", "api-keys.json");
  }
  const home = env.CLAWQL_HOME?.trim();
  if (home) {
    const homeDefault = join(home, "Auth", "api-keys.json");
    if (existsSync(homeDefault)) return homeDefault;
  }
  return undefined;
}

/** Process-wide gateway auth (issued keys + WORM sink when configured). */
export function getClawqlGatewayAuth(env: NodeJS.ProcessEnv = process.env): ClawQLAuth {
  if (!gatewayAuth) {
    const base = loadGatewayAuthConfig(env);
    gatewayAuth = createClawQLAuth({
      mode: base.mode,
      apiKey: base.apiKey,
      oidc: base.oidc,
      apiKeyStorePath: resolveIssuedApiKeyStorePath(env),
      authEventSink: getProcessWormAuthEventSink(),
      apiKeyClaimsResolver: createInferenceVirtualKeyClaimsResolver(env),
    });
  }
  return gatewayAuth;
}

export function buildGatewayAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
  mcpOAuthValidator?: (bearer: string) => Effect.Effect<AtrClaims, unknown>
): GatewayAuthConfig {
  const config = getClawqlGatewayAuth(env).config;
  if (mcpOAuthValidator == null) return config;
  return { ...config, mcpOAuthValidator };
}

/** Test helper — rebuild auth on next get. */
export function resetClawqlGatewayAuthForTests(): void {
  gatewayAuth = undefined;
}
