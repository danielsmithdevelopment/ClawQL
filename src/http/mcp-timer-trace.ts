/**
 * Wrap global timers to log callback wall duration when `CLAWQL_TIMER_TRACE=1`.
 * Used to correlate periodic work with request stalls (off-thread I/O can leave ELD quiet).
 */

import { Effect } from "effect";

export const timerTraceEnabled = (env: NodeJS.ProcessEnv = process.env): Effect.Effect<boolean> =>
  Effect.sync(() =>
    ["1", "true", "yes"].includes((env.CLAWQL_TIMER_TRACE ?? "").trim().toLowerCase())
  );

let installed = false;

function slowMsFromEnv(): number {
  const n = Number(process.env.CLAWQL_TIMER_TRACE_SLOW_MS ?? 20);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export const installTimerTrace = (): Effect.Effect<boolean> =>
  Effect.sync(() => {
    if (installed) return false;
    if (!Effect.runSync(timerTraceEnabled())) return false;
    installed = true;
    const slowMs = slowMsFromEnv();
    const origTimeout = globalThis.setTimeout;
    const origInterval = globalThis.setInterval;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirror host timer arity
    (globalThis as any).setTimeout = (handler: unknown, delay?: number, ...args: unknown[]) => {
      if (typeof handler !== "function") {
        return origTimeout(handler as never, delay as never, ...(args as never[]));
      }
      const wrapped = (...cbArgs: unknown[]) => {
        const t0 = performance.now();
        const tIso = new Date().toISOString();
        try {
          return (handler as (...a: unknown[]) => unknown)(...cbArgs);
        } finally {
          const ms = performance.now() - t0;
          if (ms >= slowMs) {
            console.error(
              `[clawql-timer-trace] kind=setTimeout delay_ms=${delay ?? 0} duration_ms=${ms.toFixed(1)} t=${tIso}`
            );
          }
        }
      };
      return origTimeout(wrapped as never, delay as never, ...(args as never[]));
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirror host timer arity
    (globalThis as any).setInterval = (handler: unknown, delay?: number, ...args: unknown[]) => {
      if (typeof handler !== "function") {
        return origInterval(handler as never, delay as never, ...(args as never[]));
      }
      const wrapped = (...cbArgs: unknown[]) => {
        const t0 = performance.now();
        const tIso = new Date().toISOString();
        try {
          return (handler as (...a: unknown[]) => unknown)(...cbArgs);
        } finally {
          const ms = performance.now() - t0;
          if (ms >= slowMs) {
            console.error(
              `[clawql-timer-trace] kind=setInterval delay_ms=${delay ?? 0} duration_ms=${ms.toFixed(1)} t=${tIso}`
            );
          }
        }
      };
      return origInterval(wrapped as never, delay as never, ...(args as never[]));
    };

    console.error(`[clawql-timer-trace] installed slow_ms=${slowMs}`);
    return true;
  });

/** Test helper — allow re-install after env changes. */
export function resetTimerTraceInstalledForTests(): void {
  installed = false;
}
