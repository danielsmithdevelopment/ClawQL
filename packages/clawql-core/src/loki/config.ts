import { Effect } from "effect";
import { parseBoundedInt } from "../config/env.js";

export type LokiPushConfig = {
  readonly enabled: boolean;
  readonly url: string | undefined;
  readonly bearerToken: string | undefined;
  readonly tenantId: string | undefined;
  readonly timeoutMs: number;
};

function envFlagOff(raw: string | undefined): boolean {
  const t = raw?.trim().toLowerCase();
  return t === "0" || t === "false" || t === "no";
}

/** Read Loki push settings. Primary API is Effect (env is re-read on each run). */
export const readLokiPushConfig = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<LokiPushConfig> =>
  Effect.sync(() => {
    const url = env.CLAWQL_LOKI_PUSH_URL?.trim() || undefined;
    return {
      enabled: Boolean(url) && !envFlagOff(env.CLAWQL_ENABLE_LOKI_PUSH),
      url,
      bearerToken: env.CLAWQL_LOKI_BEARER_TOKEN?.trim() || undefined,
      tenantId: env.CLAWQL_LOKI_TENANT_ID?.trim() || undefined,
      timeoutMs: parseBoundedInt(env.CLAWQL_LOKI_PUSH_TIMEOUT_MS, 5000, 500, 60_000),
    };
  });
