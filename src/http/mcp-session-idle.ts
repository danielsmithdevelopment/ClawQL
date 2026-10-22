/**
 * Idle eviction + live-session cap for Streamable HTTP MCP sessions.
 *
 * - `CLAWQL_MCP_SESSION_IDLE_MS` — unused sessions close after this many ms.
 *   Default **1_800_000** (30 minutes). Set `0` to disable idle eviction.
 * - `CLAWQL_MCP_SESSION_MAX` — max concurrent session transports (default **1024**).
 *   New initialize is rejected with 503 when at capacity (after idle sweep).
 */

import { Effect } from "effect";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const DEFAULT_IDLE_MS = 1_800_000;
const DEFAULT_SESSION_MAX = 1024;

export const resolveSessionIdleMs = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<number> =>
  Effect.sync(() => {
    const raw = env.CLAWQL_MCP_SESSION_IDLE_MS;
    if (raw === undefined) return DEFAULT_IDLE_MS;
    const trimmed = raw.trim();
    if (!trimmed) return DEFAULT_IDLE_MS;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return DEFAULT_IDLE_MS;
    return Math.floor(n);
  });

export const resolveSessionMax = (env: NodeJS.ProcessEnv = process.env): Effect.Effect<number> =>
  Effect.sync(() => {
    const raw = env.CLAWQL_MCP_SESSION_MAX?.trim();
    if (!raw) return DEFAULT_SESSION_MAX;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return DEFAULT_SESSION_MAX;
    return Math.min(Math.floor(n), 100_000);
  });

export type SessionIdleHandle = {
  readonly touch: (sessionId: string) => void;
  readonly stop: () => void;
  /** Evict idle sessions immediately (also used before capacity checks). */
  readonly sweep: () => number;
};

export const startSessionIdleWatcher = (
  transports: Map<string, StreamableHTTPServerTransport>,
  idleMs: number,
  opts?: { readonly tickMs?: number; readonly log?: (line: string) => void }
): Effect.Effect<SessionIdleHandle | null> =>
  Effect.sync(() => {
    if (idleMs <= 0) return null;
    const lastTouch = new Map<string, number>();
    const tickMs = opts?.tickMs ?? Math.min(5_000, Math.max(250, Math.floor(idleMs / 4)));
    const log = opts?.log ?? ((line: string) => console.error(line));

    const touch = (sessionId: string) => {
      if (!sessionId) return;
      lastTouch.set(sessionId, Date.now());
    };

    const sweep = (): number => {
      const now = Date.now();
      let evicted = 0;
      for (const [sid, transport] of [...transports.entries()]) {
        const touched = lastTouch.get(sid) ?? now;
        if (now - touched < idleMs) continue;
        lastTouch.delete(sid);
        log(
          `[clawql-mcp-http] session idle eviction sid=${sid.slice(0, 8)}… idle_ms=${idleMs}`
        );
        void transport.close().catch(() => undefined);
        if (transports.get(sid) === transport) transports.delete(sid);
        evicted += 1;
      }
      for (const sid of [...lastTouch.keys()]) {
        if (!transports.has(sid)) lastTouch.delete(sid);
      }
      return evicted;
    };

    const timer = setInterval(() => {
      sweep();
    }, tickMs);
    timer.unref?.();

    return {
      touch,
      sweep,
      stop: () => {
        clearInterval(timer);
        lastTouch.clear();
      },
    };
  });
