/**
 * Core `console_link` — deep-link URL into the ClawQL console for the current
 * session / org. Thin alias of ChatGPT-extension `clawql_console` for non-UI clients.
 *
 * Register MCP tool only when `CLAWQL_ENABLE_CONSOLE_LINK=1`.
 */

import { Context, Effect, Layer } from "effect";
import { resolveSessionLabelKey } from "../ifc/session-label-store.js";

export type ConsoleLinkInput = {
  readonly path?: string;
  readonly sessionId?: string;
  readonly orgId?: string;
};

export type ConsoleLinkResult = {
  readonly ok: true;
  readonly url: string;
  readonly baseUrl: string;
  readonly path: string;
  readonly sessionId: string;
  readonly orgId?: string;
};

function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

/** Whether the Core `console_link` MCP tool should register. Default off. */
export function consoleLinkEnabledEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> {
  return Effect.sync(() => envTruthy(env.CLAWQL_ENABLE_CONSOLE_LINK));
}

export function consoleLinkEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Effect.runSync(consoleLinkEnabledEffect(env));
}

/**
 * Resolve console origin:
 * `CLAWQL_CONSOLE_BASE_URL` → `CLAWQL_PUBLIC_ORIGIN` + `/console` → `https://clawql.com/console`.
 */
export function resolveConsoleBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.CLAWQL_CONSOLE_BASE_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const origin = env.CLAWQL_PUBLIC_ORIGIN?.trim().replace(/\/$/, "");
  if (origin) return `${origin}/console`;
  return "https://clawql.com/console";
}

function normalizePath(path: string | undefined): string {
  const raw = (path ?? "overview").trim().replace(/^\//, "");
  return raw.length > 0 ? raw : "overview";
}

/** Pure URL builder (Effect-wrapped for domain boundary). */
export const buildConsoleLinkEffect = (
  input: ConsoleLinkInput,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<ConsoleLinkResult> =>
  Effect.sync(() => {
    const baseUrl = resolveConsoleBaseUrl(env);
    const path = normalizePath(input.path);
    const sessionId = resolveSessionLabelKey(input.sessionId, env);
    const orgId =
      input.orgId?.trim() || env.CLAWQL_ORG_ID?.trim() || env.CLAWQL_TENANT_ID?.trim() || undefined;

    const url = new URL(`${baseUrl}/${path}`);
    url.searchParams.set("sessionId", sessionId);
    if (orgId) url.searchParams.set("orgId", orgId);

    return {
      ok: true as const,
      url: url.toString(),
      baseUrl,
      path,
      sessionId,
      orgId,
    };
  });

export function buildConsoleLink(
  input: ConsoleLinkInput,
  env: NodeJS.ProcessEnv = process.env
): ConsoleLinkResult {
  return Effect.runSync(buildConsoleLinkEffect(input, env));
}

export class ConsoleLinkService extends Context.Service<
  ConsoleLinkService,
  {
    readonly enabled: (env?: NodeJS.ProcessEnv) => Effect.Effect<boolean>;
    readonly build: (
      input: ConsoleLinkInput,
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<ConsoleLinkResult>;
  }
>()("clawql/ConsoleLinkService") {}

export const ConsoleLinkLive = Layer.succeed(
  ConsoleLinkService,
  ConsoleLinkService.of({
    enabled: (env) => consoleLinkEnabledEffect(env),
    build: (input, env) => buildConsoleLinkEffect(input, env),
  })
);
