/**
 * Idle eviction for Streamable HTTP MCP sessions.
 * When `CLAWQL_MCP_SESSION_IDLE_MS` > 0, unused sessions are closed after that many ms.
 */

import { Effect } from "effect";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export const resolveSessionIdleMs = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<number> =>
  Effect.sync(() => {
    const raw = env.CLAWQL_MCP_SESSION_IDLE_MS?.trim();
    if (!raw) return 0;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.floor(n);
  });

export type SessionIdleHandle = {
  readonly touch: (sessionId: string) => void;
  readonly stop: () => void;
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

    const timer = setInterval(() => {
      const now = Date.now();
      for (const [sid, transport] of [...transports.entries()]) {
        const touched = lastTouch.get(sid) ?? now;
        if (now - touched < idleMs) continue;
        lastTouch.delete(sid);
        log(
          `[clawql-mcp-http] session idle eviction sid=${sid.slice(0, 8)}… idle_ms=${idleMs}`
        );
        void transport.close().catch(() => undefined);
        // onclose should delete; belt-and-suspenders:
        if (transports.get(sid) === transport) transports.delete(sid);
      }
      // Drop touch entries for sessions already gone.
      for (const sid of [...lastTouch.keys()]) {
        if (!transports.has(sid)) lastTouch.delete(sid);
      }
    }, tickMs);
    timer.unref?.();

    return {
      touch,
      stop: () => {
        clearInterval(timer);
        lastTouch.clear();
      },
    };
  });
