/**
 * Read-only program runner (ADR 0015 v0) — host-callback JSON plan executor.
 *
 * Governing rule: a program may never see or do more than individual
 * search/execute calls. Writes (risk policy mandate/block) are rejected with a
 * fix hint pointing at future proposed writes or plain `execute`.
 */

import { randomBytes } from "node:crypto";
import { appendProcessWormEffect } from "clawql-audit";
import { Context, Duration, Effect, Layer, Option } from "effect";
import type { ExecuteInputDecoded, SearchInputDecoded } from "../schema/search-execute-schema.js";
import type { OperationRisk, OperationRiskPolicy } from "../risk/operation-risk-types.js";
import {
  resolveProgramCapsEffect,
  resolveProgramTimeoutMsEffect,
  type ProgramCaps,
} from "./program-caps.js";
import { programIfcHostEffect, type ProgramOperationInfo } from "./program-ifc.js";
import type { ProgramJournalBackend, ProgramJournalStatus } from "./program-journal.js";
import {
  parseProgramPlanEffect,
  type ProgramPlan,
  type ProgramPlanCall,
  type ProgramPlanMode,
} from "./program-plan.js";

export type ProgramHostExecuteResult = {
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
};

export type ProgramHostSearchResult = {
  readonly formattedText: string;
};

/** A plan call served from the durable journal instead of the host. */
export type ProgramReplayedCall = {
  readonly index: number;
  readonly tool: "execute" | "search";
  readonly operationId?: string;
  readonly ok: boolean;
};

/**
 * Host-injected callbacks — production wires these to the same ExecuteService /
 * SearchService paths as the MCP tools (gate, IFC, audit).
 */
export type ProgramHost = {
  readonly execute: (
    input: ExecuteInputDecoded,
    ctx: { readonly programId: string }
  ) => Effect.Effect<ProgramHostExecuteResult, Error>;
  readonly search: (
    input: SearchInputDecoded,
    ctx: { readonly programId: string }
  ) => Effect.Effect<ProgramHostSearchResult, Error>;
  /**
   * Resolve operation risk before calling execute. Return `null` when the
   * operationId is unknown (runner fails closed).
   */
  readonly resolveRisk: (operationId: string) => Effect.Effect<
    {
      readonly found: boolean;
      readonly policy?: OperationRiskPolicy;
      readonly risk?: OperationRisk;
      /**
       * Lets session IFC tell reads from writes and label them. Without it a call
       * counts as both an unknown-source read and a write (fail closed).
       */
      readonly operation?: ProgramOperationInfo;
    },
    Error
  >;
  /**
   * Bookkeeping for a replayed call, e.g. re-accumulating session IFC read labels
   * that died with a crashed process. A failure fails the attempt rather than
   * handing back data the session has not been labeled for.
   */
  readonly replayed?: (
    call: ProgramReplayedCall,
    ctx: { readonly programId: string }
  ) => Effect.Effect<void, Error>;
};

export type ExecuteProgramInput = {
  readonly source: string;
  readonly timeoutMs?: number;
  readonly sessionId?: string;
};

export type ProgramCallRecord = {
  readonly index: number;
  readonly id?: string;
  readonly tool: "execute" | "search";
  readonly operationId?: string;
  readonly query?: string;
  readonly ok: boolean;
  readonly programId: string;
  readonly error?: string;
  readonly status?: string;
  readonly resultPreview?: string;
  /** Served from the durable journal; the host was not called again. */
  readonly replayed?: boolean;
};

export type DurableProgramDiagnostics = {
  readonly backend: ProgramJournalBackend;
  readonly status: ProgramJournalStatus;
  readonly resumed: boolean;
  readonly replayedCalls: number;
  readonly executedCalls: number;
  readonly journaledCalls: number;
  /** Wall clock of the first attempt (a journaled nondeterministic value). */
  readonly startedAt?: string;
};

export type ExecuteProgramDiagnostics = {
  readonly interpreter: "plan-runner-v0";
  readonly honesty: string;
  readonly programId: string;
  readonly mode?: "parallel" | "sequential";
  readonly callCount: number;
  readonly elapsedMs: number;
  readonly timedOut?: boolean;
  readonly truncated?: boolean;
  readonly fixHint?: string;
  readonly error?: string;
  /** Machine-readable refusal code (durable runner), e.g. `program_not_found`. */
  readonly code?: string;
  readonly durable?: DurableProgramDiagnostics;
};

export type ExecuteProgramResult = {
  readonly ok: boolean;
  readonly programId: string;
  readonly result: unknown;
  readonly calls: readonly ProgramCallRecord[];
  readonly diagnostics: ExecuteProgramDiagnostics;
};

/**
 * Durability hooks for {@link runProgramPlanEffect}: `replay` may serve a call
 * from a journal (the host is not called); `completed` persists a host-served
 * call before the program moves on.
 */
export type ProgramCallHooks<E> = {
  readonly replay: (
    index: number,
    call: ProgramPlanCall
  ) => Effect.Effect<Option.Option<ProgramCallOutcome>, E>;
  readonly completed: (
    index: number,
    call: ProgramPlanCall,
    outcome: ProgramCallOutcome
  ) => Effect.Effect<void, E>;
};

export type ProgramPlanRunInput<E> = {
  readonly programId: string;
  readonly plan: ProgramPlan;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly sessionId?: string;
  /** Start of the attempt for `elapsedMs` (defaults to when the plan starts running). */
  readonly startedAtMs?: number;
  /** Replaces the v0 honesty line in diagnostics. */
  readonly honesty?: string;
  /** Extra metadata on the program-level WORM events. */
  readonly auditMetadata?: Readonly<Record<string, unknown>>;
  readonly hooks?: ProgramCallHooks<E>;
  /** Session IFC flags (`CLAWQL_ENABLE_SESSION_IFC`, allow-list); defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
};

export type PreparedProgramPlan =
  | { readonly ok: true; readonly plan: ProgramPlan }
  | {
      readonly ok: false;
      readonly error: string;
      readonly fixHint?: string;
      readonly mode?: ProgramPlanMode;
    };

const HONESTY =
  "v0 plan runner; OpenCode vendor is next. source must be a JSON plan of parallel/sequential read executes — not free-form JS.";

const WRITE_REJECT_HINT =
  "Programs may not perform writes in v0. Use plain execute (with mandate/resume) for mutating operations, or wait for proposed writes (ADR 0015).";

export function newProgramIdEffect(): Effect.Effect<string> {
  return Effect.sync(() => `prog_${randomBytes(12).toString("hex")}`);
}

function previewText(text: string, max = 400): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

function looksOkJson(text: string): { ok: boolean; status?: string; error?: string } {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object") {
      const o = parsed as Record<string, unknown>;
      if (o.ok === false) {
        return {
          ok: false,
          status: typeof o.status === "string" ? o.status : undefined,
          error:
            typeof o.error === "string"
              ? o.error
              : typeof o.reason === "string"
                ? o.reason
                : undefined,
        };
      }
      if (
        o.status === "mandate_required" ||
        o.status === "blocked" ||
        o.status === "pending_approval"
      ) {
        return {
          ok: false,
          status: String(o.status),
          error: typeof o.reason === "string" ? o.reason : undefined,
        };
      }
      if ("error" in o && o.error) {
        return { ok: false, error: String(o.error) };
      }
    }
  } catch {
    /* non-JSON treated as ok */
  }
  return { ok: true };
}

/** Fail closed: only explicit `allow` may run inside a program. */
function isReadAllowPolicy(policy: OperationRiskPolicy | undefined): boolean {
  return policy === "allow";
}

function utf8ByteLength(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

function truncateResult(
  result: unknown,
  maxBytes: number
): { result: unknown; truncated: boolean } {
  const json = JSON.stringify(result);
  if (utf8ByteLength(json) <= maxBytes) return { result, truncated: false };
  return {
    result: {
      truncated: true,
      byteCount: utf8ByteLength(json),
      limit: maxBytes,
      preview: json.slice(0, Math.min(json.length, 2048)) + "…[TRUNCATED]",
    },
    truncated: true,
  };
}

/** One plan call as the program observed it. */
export type ProgramCallOutcome = {
  readonly record: ProgramCallRecord;
  readonly value: unknown;
};

function failResult(
  programId: string,
  calls: readonly ProgramCallRecord[],
  diagnostics: Omit<ExecuteProgramDiagnostics, "interpreter" | "honesty" | "programId"> & {
    readonly fixHint?: string;
    readonly error?: string;
    readonly honesty?: string;
  }
): ExecuteProgramResult {
  return {
    ok: false,
    programId,
    result: null,
    calls,
    diagnostics: {
      interpreter: "plan-runner-v0",
      honesty: HONESTY,
      programId,
      ...diagnostics,
    },
  };
}

/** Reject plans that exceed the tool-call cap (checked again when a journal resumes). */
export function checkProgramPlanCapsEffect(
  plan: ProgramPlan,
  caps: ProgramCaps
): Effect.Effect<PreparedProgramPlan> {
  return Effect.sync(() =>
    plan.calls.length > caps.maxToolCalls
      ? {
          ok: false as const,
          mode: plan.mode,
          error: `plan exceeds max tool calls (${plan.calls.length} > ${caps.maxToolCalls})`,
          fixHint: "Split into multiple programs or raise CLAWQL_PROGRAM_MAX_TOOL_CALLS.",
        }
      : { ok: true as const, plan }
  );
}

/** Validate `source` against caps and decode the v0 JSON plan. */
export function prepareProgramPlanEffect(
  source: string,
  caps: ProgramCaps
): Effect.Effect<PreparedProgramPlan> {
  return Effect.gen(function* () {
    if (source.length > caps.maxSourceLength) {
      return {
        ok: false as const,
        error: `source exceeds max length (${source.length} > ${caps.maxSourceLength})`,
        fixHint: `Shrink the JSON plan or raise CLAWQL_PROGRAM_MAX_SOURCE_LENGTH (hard cap still applies).`,
      };
    }

    const planOrErr = yield* parseProgramPlanEffect(source);
    if ("ok" in planOrErr && planOrErr.ok === false) {
      return { ok: false as const, error: planOrErr.error, fixHint: planOrErr.fixHint };
    }
    const plan = planOrErr as Exclude<typeof planOrErr, { ok: false }>;

    if (plan.calls.length === 0) {
      return {
        ok: false as const,
        mode: plan.mode,
        error: "plan.calls is empty",
        fixHint: "Add at least one read execute or search call.",
      };
    }
    return yield* checkProgramPlanCapsEffect(plan, caps);
  });
}

export function runProgramEffect(
  input: ExecuteProgramInput,
  host: ProgramHost,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<ExecuteProgramResult> {
  return Effect.gen(function* () {
    const started = Date.now();
    const programId = yield* newProgramIdEffect();
    const caps = yield* resolveProgramCapsEffect(env);
    const source = typeof input.source === "string" ? input.source : "";

    const prepared = yield* prepareProgramPlanEffect(source, caps);
    if (!prepared.ok) {
      return failResult(programId, [], {
        callCount: 0,
        elapsedMs: Date.now() - started,
        mode: prepared.mode,
        error: prepared.error,
        fixHint: prepared.fixHint,
      });
    }

    return yield* runProgramPlanEffect(
      {
        programId,
        plan: prepared.plan,
        timeoutMs: yield* resolveProgramTimeoutMsEffect(input.timeoutMs, caps),
        maxOutputBytes: caps.maxOutputBytes,
        sessionId: input.sessionId,
        startedAtMs: started,
        env,
      },
      host
    );
  });
}

/**
 * Run a validated plan under `programId`: per-call gate + host path, timeout,
 * output cap. With `hooks`, calls may be replayed from and journaled to a
 * durable store (see durable-runner.ts).
 */
export function runProgramPlanEffect<E = never>(
  input: ProgramPlanRunInput<E>,
  host: ProgramHost
): Effect.Effect<ExecuteProgramResult, E> {
  return Effect.gen(function* () {
    const started = input.startedAtMs ?? Date.now();
    const { programId, plan, timeoutMs, maxOutputBytes, hooks } = input;
    const honesty = input.honesty ?? HONESTY;

    yield* appendProcessWormEffect({
      type: "TOOL_CALL_ATTEMPT",
      timestamp: new Date().toISOString(),
      sessionId: input.sessionId ?? "",
      metadata: {
        source: "execute_program",
        programId,
        mode: plan.mode,
        callCount: plan.calls.length,
        interpreter: "plan-runner-v0",
        ...input.auditMetadata,
      },
    }).pipe(Effect.catch(() => Effect.void));

    const gatedHost = yield* programIfcHostEffect(plan, host, input.env ?? process.env);

    const runOne = (call: ProgramPlanCall, index: number): Effect.Effect<ProgramCallOutcome> =>
      Effect.gen(function* () {
        if (call.tool === "search") {
          yield* appendProcessWormEffect({
            type: "TOOL_CALL_ATTEMPT",
            timestamp: new Date().toISOString(),
            sessionId: input.sessionId ?? "",
            metadata: {
              source: "execute_program",
              programId,
              toolName: "search",
              query: call.query,
              index,
            },
          }).pipe(Effect.catch(() => Effect.void));

          const out = yield* gatedHost
            .search({ query: call.query, limit: call.limit ?? 5 }, { programId })
            .pipe(
              Effect.catch((e) =>
                Effect.succeed({
                  formattedText: JSON.stringify({
                    ok: false,
                    error: e instanceof Error ? e.message : String(e),
                  }),
                })
              )
            );
          const look = looksOkJson(out.formattedText);
          const record: ProgramCallRecord = {
            index,
            id: call.id,
            tool: "search",
            query: call.query,
            ok: look.ok,
            programId,
            error: look.error,
            status: look.status,
            resultPreview: previewText(out.formattedText),
          };
          yield* appendProcessWormEffect({
            type: "TOOL_CALL_RESULT",
            timestamp: new Date().toISOString(),
            sessionId: input.sessionId ?? "",
            metadata: {
              source: "execute_program",
              programId,
              toolName: "search",
              ok: look.ok,
              index,
            },
          }).pipe(Effect.catch(() => Effect.void));
          let value: unknown = out.formattedText;
          try {
            value = JSON.parse(out.formattedText);
          } catch {
            /* keep string */
          }
          return { record, value };
        }

        // execute — read-only gate before host path
        const riskInfo = yield* gatedHost
          .resolveRisk(call.operationId)
          .pipe(Effect.catch(() => Effect.succeed({ found: false as const })));
        if (!riskInfo.found) {
          const record: ProgramCallRecord = {
            index,
            id: call.id,
            tool: "execute",
            operationId: call.operationId,
            ok: false,
            programId,
            error: `Unknown operationId: ${call.operationId}`,
            status: "unknown_operation",
          };
          return {
            record,
            value: {
              ok: false,
              error: record.error,
              fixHint: "Call search first, or use plain execute for discovery errors.",
            },
          };
        }
        if (!isReadAllowPolicy(riskInfo.policy)) {
          const policyLabel = riskInfo.policy ?? "unknown";
          const record: ProgramCallRecord = {
            index,
            id: call.id,
            tool: "execute",
            operationId: call.operationId,
            ok: false,
            programId,
            error: `Write rejected in program mode (risk policy: ${policyLabel})`,
            status: "program_write_rejected",
          };
          yield* appendProcessWormEffect({
            type: "TOOL_CALL_RESULT",
            timestamp: new Date().toISOString(),
            sessionId: input.sessionId ?? "",
            metadata: {
              source: "execute_program",
              programId,
              toolName: "execute",
              operationId: call.operationId,
              ok: false,
              status: "program_write_rejected",
              risk: riskInfo.risk,
              index,
            },
          }).pipe(Effect.catch(() => Effect.void));
          return {
            record,
            value: {
              ok: false,
              status: "program_write_rejected",
              operationId: call.operationId,
              risk: riskInfo.risk,
              reason: record.error,
              fixHint: WRITE_REJECT_HINT,
            },
          };
        }

        yield* appendProcessWormEffect({
          type: "TOOL_CALL_ATTEMPT",
          timestamp: new Date().toISOString(),
          sessionId: input.sessionId ?? "",
          metadata: {
            source: "execute_program",
            programId,
            toolName: "execute",
            operationId: call.operationId,
            index,
          },
        }).pipe(Effect.catch(() => Effect.void));

        const out = yield* gatedHost
          .execute(
            {
              operationId: call.operationId,
              args: call.args ?? {},
              fields: call.fields,
              where: call.where,
            },
            { programId }
          )
          .pipe(
            Effect.catch((e) =>
              Effect.succeed({
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({
                      ok: false,
                      error: e instanceof Error ? e.message : String(e),
                    }),
                  },
                ],
              })
            )
          );
        const text = out.content[0]?.text ?? "";
        const look = looksOkJson(text);
        const record: ProgramCallRecord = {
          index,
          id: call.id,
          tool: "execute",
          operationId: call.operationId,
          ok: look.ok,
          programId,
          error: look.error,
          status: look.status,
          resultPreview: previewText(text),
        };
        yield* appendProcessWormEffect({
          type: "TOOL_CALL_RESULT",
          timestamp: new Date().toISOString(),
          sessionId: input.sessionId ?? "",
          metadata: {
            source: "execute_program",
            programId,
            toolName: "execute",
            operationId: call.operationId,
            ok: look.ok,
            index,
          },
        }).pipe(Effect.catch(() => Effect.void));
        let value: unknown = text;
        try {
          value = JSON.parse(text);
        } catch {
          /* keep string */
        }
        return { record, value };
      });

    const step = (call: ProgramPlanCall, index: number): Effect.Effect<ProgramCallOutcome, E> =>
      hooks === undefined
        ? runOne(call, index)
        : Effect.gen(function* () {
            const replayed = yield* hooks.replay(index, call);
            if (Option.isSome(replayed)) return replayed.value;
            const outcome = yield* runOne(call, index);
            yield* hooks.completed(index, call, outcome);
            return outcome;
          });

    const body =
      plan.mode === "parallel"
        ? Effect.all(
            plan.calls.map((c, i) => step(c, i)),
            { concurrency: "unbounded" }
          )
        : Effect.gen(function* () {
            const acc: ProgramCallOutcome[] = [];
            for (let i = 0; i < plan.calls.length; i++) {
              acc.push(yield* step(plan.calls[i]!, i));
            }
            return acc;
          });

    const timed = yield* Effect.timeoutOption(body, Duration.millis(timeoutMs));
    const elapsedMs = Date.now() - started;
    if (Option.isNone(timed)) {
      return failResult(programId, [], {
        callCount: plan.calls.length,
        elapsedMs,
        mode: plan.mode,
        timedOut: true,
        error: `program timed out after ${timeoutMs}ms`,
        fixHint: "Raise timeoutMs (capped) or reduce fan-out / sequential depth.",
        honesty,
      });
    }
    const runOut = timed.value;

    const calls = runOut.map((r) => r.record);
    const allOk = calls.every((c) => c.ok);
    const results = runOut.map((r) => ({
      id: r.record.id ?? `call_${r.record.index}`,
      tool: r.record.tool,
      operationId: r.record.operationId,
      ok: r.record.ok,
      value: r.value,
    }));
    const { result, truncated } = truncateResult({ mode: plan.mode, results }, maxOutputBytes);

    yield* appendProcessWormEffect({
      type: "TOOL_CALL_RESULT",
      timestamp: new Date().toISOString(),
      sessionId: input.sessionId ?? "",
      metadata: {
        source: "execute_program",
        programId,
        ok: allOk,
        callCount: calls.length,
        truncated,
        interpreter: "plan-runner-v0",
        ...input.auditMetadata,
      },
    }).pipe(Effect.catch(() => Effect.void));

    return {
      ok: allOk,
      programId,
      result,
      calls,
      diagnostics: {
        interpreter: "plan-runner-v0",
        honesty,
        programId,
        mode: plan.mode,
        callCount: calls.length,
        elapsedMs,
        truncated: truncated || undefined,
        error: allOk ? undefined : "one or more program calls failed",
        fixHint: allOk
          ? undefined
          : "Inspect calls[].error / status; fall back to single search/execute as needed.",
      },
    };
  });
}

export class ProgramRunnerService extends Context.Service<
  ProgramRunnerService,
  {
    readonly run: (
      input: ExecuteProgramInput,
      host: ProgramHost,
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<ExecuteProgramResult>;
  }
>()("clawql/ProgramRunnerService") {}

export const ProgramRunnerLive = Layer.succeed(
  ProgramRunnerService,
  ProgramRunnerService.of({
    run: (input, host, env) => runProgramEffect(input, host, env),
  })
);

/** Sync façade for thin MCP host boundary. */
export function runProgram(
  input: ExecuteProgramInput,
  host: ProgramHost,
  env: NodeJS.ProcessEnv = process.env
): Promise<ExecuteProgramResult> {
  return Effect.runPromise(runProgramEffect(input, host, env));
}
