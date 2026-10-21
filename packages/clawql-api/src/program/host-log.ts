/**
 * Parse durable-runner kill-worker HOST_LOG lines (JSON or legacy bare op id).
 */

import { Effect } from "effect";

export type HostLogLine = {
  readonly operationId: string;
  readonly effectId: string;
  readonly applied: boolean;
};

export const parseHostLogLines = (raw: string): Effect.Effect<readonly HostLogLine[]> =>
  Effect.sync(() =>
    raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          const o = JSON.parse(line) as Partial<HostLogLine>;
          if (o && typeof o.operationId === "string") {
            return {
              operationId: o.operationId,
              effectId: typeof o.effectId === "string" ? o.effectId : o.operationId,
              applied: o.applied !== false,
            };
          }
        } catch {
          /* legacy */
        }
        return { operationId: line.trim(), effectId: line.trim(), applied: true };
      })
  );

export const hostLogOperationIds = (raw: string): Effect.Effect<readonly string[]> =>
  parseHostLogLines(raw).pipe(Effect.map((lines) => lines.map((l) => l.operationId)));
