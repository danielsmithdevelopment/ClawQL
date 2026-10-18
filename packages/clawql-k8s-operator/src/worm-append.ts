/**
 * Host clawql-audit append for burst/mesh operator events (aws-celld-burst §8 / §12).
 * Effect-first; never embeds a parallel trail.
 */

import { Context, Effect, Layer } from "effect";
import {
  bridgeMeshDenial,
  type BridgedMeshDenial,
  type MeshDenialEvent,
} from "./session-placement.js";
import type { BurstArchitectureWORMEntryType } from "./worm-types.js";

export type HostWormAppendConfig = {
  readonly url: string;
  readonly apiKey?: string;
  readonly timeoutMs?: number;
};

export type HostWormAppendResult = {
  readonly ok: boolean;
  readonly deferred?: boolean;
  readonly status?: number;
  readonly entry?: unknown;
  readonly error?: string;
  readonly wormType?: BurstArchitectureWORMEntryType;
  readonly sessionId?: string;
  readonly honesty: string;
};

export function resolveHostWormConfig(
  env: NodeJS.ProcessEnv = process.env
): HostWormAppendConfig | null {
  const url = (env.CLAWQL_AUDIT_WORM_URL || env.CLAWQL_WORM_HTTP_URL || "").trim();
  if (!url) return null;
  const apiKey = (env.CLAWQL_AUDIT_API_KEY || env.CLAWQL_WORM_API_KEY || "").trim() || undefined;
  const timeoutMs = Number(env.CLAWQL_AUDIT_WORM_TIMEOUT_MS ?? 15_000);
  return {
    url: url.replace(/\/$/, ""),
    apiKey,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15_000,
  };
}

export function appendHostWormEntryEffect(
  entry: {
    readonly type: string;
    readonly sessionId: string;
    readonly agentName?: string;
    readonly cellId?: string;
    readonly metadata?: Record<string, unknown>;
  },
  config: HostWormAppendConfig | null = resolveHostWormConfig(),
  fetchImpl: typeof fetch = fetch
): Effect.Effect<HostWormAppendResult> {
  return Effect.gen(function* () {
    if (!config?.url) {
      return {
        ok: false,
        deferred: true,
        honesty:
          "CLAWQL_AUDIT_WORM_URL unset — operator events stay un-appended (fail-closed when URL set)",
      };
    }

    const result = yield* Effect.promise(async (): Promise<HostWormAppendResult> => {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        accept: "application/json",
      };
      if (config.apiKey) headers.authorization = `ApiKey ${config.apiKey}`;
      try {
        const res = await fetchImpl(`${config.url}/entries`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            type: entry.type,
            timestamp: new Date().toISOString(),
            sessionId: entry.sessionId,
            ...(entry.agentName ? { agentName: entry.agentName } : {}),
            ...(entry.cellId ? { cellId: entry.cellId } : {}),
            ...(entry.metadata ? { metadata: entry.metadata } : {}),
          }),
          signal: AbortSignal.timeout(config.timeoutMs ?? 15_000),
        });
        const text = await res.text();
        let parsed: unknown = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = { raw: text.slice(0, 300) };
        }
        if (!res.ok) {
          return {
            ok: false,
            status: res.status,
            entry: parsed,
            error: `HTTP ${res.status}`,
            honesty: "host clawql-audit append rejected",
            wormType: entry.type as BurstArchitectureWORMEntryType,
            sessionId: entry.sessionId,
          };
        }
        return {
          ok: true,
          status: res.status,
          entry: parsed,
          honesty: "appended to host clawql-audit WORMAuditTrail (tip-loaded)",
          wormType: entry.type as BurstArchitectureWORMEntryType,
          sessionId: entry.sessionId,
        };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          honesty: "host clawql-audit append failed (network)",
          wormType: entry.type as BurstArchitectureWORMEntryType,
          sessionId: entry.sessionId,
        };
      }
    });
    return result;
  });
}

export function appendBridgedMeshDenialEffect(
  event: MeshDenialEvent,
  config: HostWormAppendConfig | null = resolveHostWormConfig(),
  fetchImpl: typeof fetch = fetch
): Effect.Effect<{ bridged: BridgedMeshDenial; append: HostWormAppendResult }> {
  return Effect.gen(function* () {
    const bridged = bridgeMeshDenial(event);
    const append = yield* appendHostWormEntryEffect(
      {
        type: bridged.wormType,
        sessionId: bridged.sessionId,
        agentName: "clawql-k8s-operator",
        metadata: {
          ...bridged.metadata,
          source: "burst-operator-bridge",
        },
      },
      config,
      fetchImpl
    );
    return { bridged, append };
  });
}

export class HostWormAppendService extends Context.Service<
  HostWormAppendService,
  {
    readonly appendMeshDenial: (
      event: MeshDenialEvent
    ) => Effect.Effect<{ bridged: BridgedMeshDenial; append: HostWormAppendResult }>;
  }
>()("clawql/HostWormAppendService") {}

export function hostWormAppendLayer(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Layer.Layer<HostWormAppendService> {
  const config = resolveHostWormConfig(env);
  return Layer.succeed(
    HostWormAppendService,
    HostWormAppendService.of({
      appendMeshDenial: (event) => appendBridgedMeshDenialEffect(event, config, fetchImpl),
    })
  );
}
