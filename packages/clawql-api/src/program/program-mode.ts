/**
 * Read-only program mode enablement (ADR 0015).
 *
 * Register MCP `execute_program` and `submit_program_proposals` only when
 * `CLAWQL_ENABLE_PROGRAMS=1`.
 * v0 is a host-callback **plan runner** (JSON plans), not a full OpenCode
 * AST interpreter — see docs/adr/0015-program-mode-alongside-search-execute.md.
 */

import { Context, Effect, Layer } from "effect";

function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

/** Whether the Core program MCP tools should register. Default off. */
export function programsEnabledEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> {
  return Effect.sync(() => envTruthy(env.CLAWQL_ENABLE_PROGRAMS));
}

export function programsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Effect.runSync(programsEnabledEffect(env));
}

export class ProgramModeService extends Context.Service<
  ProgramModeService,
  {
    readonly enabled: (env?: NodeJS.ProcessEnv) => Effect.Effect<boolean>;
  }
>()("clawql/ProgramModeService") {}

export const ProgramModeLive = Layer.succeed(
  ProgramModeService,
  ProgramModeService.of({
    enabled: (env) => programsEnabledEffect(env),
  })
);
