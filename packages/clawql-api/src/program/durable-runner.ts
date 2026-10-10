/**
 * Durable program runner (ADR 0015 durable code mode — program mode step 2).
 *
 * Runs a v0 plan with each host-served call journaled (fsync'd) before the program
 * moves on. A program that crashed, timed out or was interrupted resumes from its
 * journal: journaled calls replay without calling the host again, and journaled
 * nondeterministic values (`clock.startedAt`) replay unchanged.
 *
 * At most once for writes: before a call that can reach the host as a write, an
 * intent is journaled. On resume, an intent without an entry means the write may or
 * may not have happened, so the call is reported `outcome_unknown` and is not re-run.
 * Interrupted reads re-run.
 *
 * The journal is a celld-shaped file (JSONL) stand-in until the celld pin hosts the
 * isolate (see program-journal.ts). There is no isolate snapshot: resume re-runs the
 * plan loop, which is deterministic given the journaled results.
 */

import { appendProcessWormEffect } from "clawql-audit";
import { Clock, Context, Data, Effect, Layer, Option, Result } from "effect";
import { isReadOperation } from "../ifc/session-ifc-enforce.js";
import { resolveSessionLabelKey } from "../ifc/session-label-store.js";
import { canonicalizeForHash } from "../pending/args-hash.js";
import {
  resolveProgramCapsEffect,
  resolveProgramTimeoutMsEffect,
  type ProgramCaps,
} from "./program-caps.js";
import {
  hashProgramSourceEffect,
  programJournalLayer,
  ProgramJournalService,
  validateProgramIdEffect,
  type ProgramJournal,
  type ProgramJournalApi,
  type ProgramJournalEntry,
  type ProgramJournalError,
  type ProgramJournalIntent,
  type ProgramJournalStatus,
} from "./program-journal.js";
import type {
  ProgramPlan,
  ProgramPlanCall,
  ProgramPlanExecuteCall,
  ProgramPlanMode,
} from "./program-plan.js";
import {
  checkProgramPlanCapsEffect,
  newProgramIdEffect,
  prepareProgramPlanEffect,
  runProgramPlanEffect,
  type DurableProgramDiagnostics,
  type ExecuteProgramInput,
  type ExecuteProgramResult,
  type ProgramCallHooks,
  type ProgramCallOutcome,
  type ProgramCallRecord,
  type ProgramHost,
} from "./program-runner.js";

export const DURABLE_PROGRAM_HONESTY =
  "v0 plan runner with a durable journal: a celld-shaped file (JSONL) stand-in until the celld pin hosts the isolate. Journaled calls replay on resume and are not re-run; a write in flight when the program stopped resumes as outcome_unknown. source must be a JSON plan, not free-form JS.";

/** Nondeterministic value journaled on the first attempt and replayed on every resume. */
export const NONDET_STARTED_AT = "clock.startedAt";

const PARKED_HINT =
  "Resume with execute_program { programId }: journaled calls replay and are not re-run. Raise timeoutMs (capped) if a single call needs longer.";

const OUTCOME_UNKNOWN_REASON =
  "A write was in flight when the program stopped; it is not re-run (at most once).";

const OUTCOME_UNKNOWN_HINT =
  "Check the provider for the side effect before retrying it with plain execute.";

export type DurableProgramInput = Omit<ExecuteProgramInput, "source"> & {
  /** JSON plan. Required to start a program; on resume it must match the journaled source. */
  readonly source?: string;
  /** Start under this id, or resume it when its journal exists. Generated when omitted. */
  readonly programId?: string;
};

export type DurableProgramRunOptions = {
  /**
   * Crash simulation for tests: die once this many calls have run and been journaled
   * in this attempt, leaving the program `running` with nothing finalized.
   */
  readonly simulateCrashAfterCalls?: number;
};

export type ResumeProgramOptions = DurableProgramRunOptions & {
  readonly sessionId?: string;
  readonly timeoutMs?: number;
};

export type DurableProgramRefusalCode =
  | "invalid_plan"
  | "program_source_required"
  | "invalid_program_id"
  | "program_not_found"
  | "program_source_mismatch"
  | "program_failed"
  | "program_busy"
  | "journal_unavailable"
  | "journal_corrupt"
  | "journal_divergence"
  | "replay_label_failed";

/** The defect {@link DurableProgramRunOptions.simulateCrashAfterCalls} dies with. */
export class ProgramCrashSimulated extends Data.TaggedError("ProgramCrashSimulated")<{
  readonly programId: string;
  readonly afterCalls: number;
}> {}

class DurableProgramRefusal extends Data.TaggedError("DurableProgramRefusal")<{
  readonly programId: string;
  readonly code: DurableProgramRefusalCode;
  readonly message: string;
  readonly fixHint?: string;
  readonly mode?: ProgramPlanMode;
}> {}

type RiskInfo = Effect.Success<ReturnType<ProgramHost["resolveRisk"]>>;

type AttemptContext = {
  readonly api: ProgramJournalApi;
  readonly journal: ProgramJournal;
  readonly resumed: boolean;
  readonly host: ProgramHost;
  readonly env: NodeJS.ProcessEnv;
  readonly caps: ProgramCaps;
  readonly input: DurableProgramInput;
  readonly options: DurableProgramRunOptions;
  readonly startedAtMs: number;
};

type AttemptProgress = {
  readonly mode: ProgramPlanMode;
  readonly callCount: number;
  readonly calls: readonly ProgramCallRecord[];
  readonly durable: DurableProgramDiagnostics;
};

const nowIsoEffect: Effect.Effect<string> = Effect.map(Clock.currentTimeMillis, (ms) =>
  new Date(ms).toISOString()
);

function callIdFor(call: ProgramPlanCall, index: number): string {
  return call.id ?? `call_${index}`;
}

/** Call inputs an entry is bound to, besides its tool and operationId. */
function journaledArgs(call: ProgramPlanCall): Record<string, unknown> {
  return call.tool === "execute"
    ? { ...(call.args ?? {}) }
    : { query: call.query, ...(call.limit !== undefined ? { limit: call.limit } : {}) };
}

function entryMatchesCall(entry: ProgramJournalEntry, call: ProgramPlanCall, index: number) {
  return (
    entry.tool === call.tool &&
    entry.callId === callIdFor(call, index) &&
    entry.operationId === (call.tool === "execute" ? call.operationId : undefined) &&
    canonicalizeForHash(entry.args ?? {}) === canonicalizeForHash(journaledArgs(call))
  );
}

function toJournalEntry(
  index: number,
  call: ProgramPlanCall,
  outcome: ProgramCallOutcome,
  completedAt: string
): ProgramJournalEntry {
  const { record } = outcome;
  return {
    index,
    callId: callIdFor(call, index),
    tool: call.tool,
    ...(call.tool === "execute" ? { operationId: call.operationId } : {}),
    args: journaledArgs(call),
    result: {
      ok: record.ok,
      status: record.status,
      error: record.error,
      resultPreview: record.resultPreview,
      value: outcome.value,
    },
    completedAt,
  };
}

/** The call as the program first observed it, rebuilt from its journal entry. */
function replayedOutcome(
  programId: string,
  call: ProgramPlanCall,
  index: number,
  entry: ProgramJournalEntry
): ProgramCallOutcome {
  const { result } = entry;
  return {
    record: {
      index,
      id: call.id,
      tool: call.tool,
      ...(call.tool === "execute" ? { operationId: call.operationId } : { query: call.query }),
      ok: result.ok,
      programId,
      error: result.error,
      status: result.status,
      resultPreview: result.resultPreview,
      replayed: true,
    },
    value: result.value,
  };
}

function outcomeUnknown(
  programId: string,
  call: ProgramPlanExecuteCall,
  index: number,
  intent: ProgramJournalIntent
): ProgramCallOutcome {
  return {
    record: {
      index,
      id: call.id,
      tool: "execute",
      operationId: call.operationId,
      ok: false,
      programId,
      error: OUTCOME_UNKNOWN_REASON,
      status: "outcome_unknown",
    },
    value: {
      ok: false,
      status: "outcome_unknown",
      operationId: call.operationId,
      startedAt: intent.startedAt,
      reason: OUTCOME_UNKNOWN_REASON,
      fixHint: OUTCOME_UNKNOWN_HINT,
    },
  };
}

/**
 * One risk lookup per operation per attempt, inside the program's timeout: the intent
 * check and the runner's gate must classify a call the same way, or a write could
 * reach the host without an intent.
 */
function memoizeRiskEffect(host: ProgramHost, plan: ProgramPlan): Effect.Effect<ProgramHost> {
  return Effect.gen(function* () {
    const operationIds = [
      ...new Set(plan.calls.flatMap((call) => (call.tool === "execute" ? [call.operationId] : []))),
    ];
    const facts = yield* Effect.cached(
      Effect.map(
        Effect.forEach(operationIds, (operationId) =>
          Effect.map(Effect.result(host.resolveRisk(operationId)), (r) => [operationId, r] as const)
        ),
        (pairs) => new Map(pairs)
      )
    );
    return {
      ...host,
      resolveRisk: (operationId) =>
        Effect.flatMap(facts, (byOperation): Effect.Effect<RiskInfo, Error> => {
          const r = byOperation.get(operationId);
          if (r === undefined) return host.resolveRisk(operationId);
          return Result.isSuccess(r) ? Effect.succeed(r.success) : Effect.fail(r.failure);
        }),
    };
  });
}

/**
 * Whether `call` can reach the host as a write. Only `allow` executes run, and one
 * without operation facts counts as a write (fail closed); a failed lookup never runs.
 */
function mayRunAsWriteEffect(call: ProgramPlanCall, host: ProgramHost): Effect.Effect<boolean> {
  if (call.tool !== "execute") return Effect.succeed(false);
  return host.resolveRisk(call.operationId).pipe(
    Effect.map(
      (info) =>
        info.found &&
        info.policy === "allow" &&
        (info.operation === undefined || !isReadOperation(info.operation))
    ),
    Effect.catch(() => Effect.succeed(false))
  );
}

function journalRefusal(e: ProgramJournalError): DurableProgramRefusal {
  switch (e.reason) {
    case "invalid_id":
      return new DurableProgramRefusal({
        programId: "",
        code: "invalid_program_id",
        message: e.message,
        fixHint: "Pass the programId an earlier execute_program returned, or omit it.",
      });
    case "busy":
    case "exists":
      return new DurableProgramRefusal({
        programId: e.programId,
        code: "program_busy",
        message: `program ${e.programId} is already running`,
        fixHint: "Wait for the running attempt to end, then resume it.",
      });
    case "corrupt":
      return new DurableProgramRefusal({
        programId: e.programId,
        code: "journal_corrupt",
        message: e.message,
        fixHint: "This journal cannot be replayed; start a new program.",
      });
    case "not_found":
    case "io":
      return new DurableProgramRefusal({
        programId: e.programId,
        code: "journal_unavailable",
        message: e.message,
        fixHint:
          "Make CLAWQL_PROGRAM_JOURNAL_DIR writable (a directory this user owns), then resume.",
      });
  }
}

function journalEffect<A>(
  effect: Effect.Effect<A, ProgramJournalError>
): Effect.Effect<A, DurableProgramRefusal> {
  return Effect.mapError(effect, journalRefusal);
}

function refusalResult(
  refusal: DurableProgramRefusal,
  elapsedMs: number,
  progress?: AttemptProgress
): ExecuteProgramResult {
  return {
    ok: false,
    programId: refusal.programId,
    result: null,
    calls: progress?.calls ?? [],
    diagnostics: {
      interpreter: "plan-runner-v0",
      honesty: DURABLE_PROGRAM_HONESTY,
      programId: refusal.programId,
      mode: progress?.mode ?? refusal.mode,
      callCount: progress?.callCount ?? 0,
      elapsedMs,
      code: refusal.code,
      error: refusal.message,
      fixHint: refusal.fixHint,
      durable: progress?.durable,
    },
  };
}

function runAttemptEffect(
  ctx: AttemptContext
): Effect.Effect<ExecuteProgramResult, DurableProgramRefusal> {
  return Effect.gen(function* () {
    const { api, journal, host, input } = ctx;
    const { programId, plan } = journal;
    const replayOnly = journal.status === "completed";
    const entries = new Map(journal.entries.map((e) => [e.index, e] as const));
    const intents = new Map(journal.intents.map((i) => [i.index, i] as const));
    const landed = new Map<number, ProgramCallRecord>();
    let replayedCalls = 0;
    let executedCalls = 0;
    let outcomeUnknownCalls = 0;
    const crashAfter = ctx.options.simulateCrashAfterCalls;

    const journaledStart = journal.nondet.find((n) => n.key === NONDET_STARTED_AT);
    const startedAt =
      journaledStart !== undefined
        ? String(journaledStart.value)
        : yield* Effect.gen(function* () {
            const at = yield* nowIsoEffect;
            if (!replayOnly) {
              yield* journalEffect(
                api.appendNondet(programId, { key: NONDET_STARTED_AT, value: at })
              );
            }
            return at;
          });

    const progress = (status: ProgramJournalStatus): AttemptProgress => ({
      mode: plan.mode,
      callCount: plan.calls.length,
      calls: [...landed.values()].sort((a, b) => a.index - b.index),
      durable: {
        backend: api.backend,
        status,
        resumed: ctx.resumed,
        replayedCalls,
        executedCalls,
        outcomeUnknownCalls,
        journaledCalls: journal.entries.length + executedCalls + outcomeUnknownCalls,
        startedAt,
      },
    });

    const auditResult = (metadata: Readonly<Record<string, unknown>>) =>
      appendProcessWormEffect({
        type: "TOOL_CALL_RESULT",
        timestamp: new Date().toISOString(),
        sessionId: input.sessionId ?? "",
        metadata: { source: "execute_program", programId, journal: api.backend, ...metadata },
      }).pipe(Effect.catch(() => Effect.void));

    const diverged = (index: number, why: string) =>
      Effect.fail(
        new DurableProgramRefusal({
          programId,
          code: "journal_divergence",
          message: `program journal ${programId} call ${index}: ${why}`,
          fixHint: "The journal no longer matches its plan; start a new program.",
        })
      );

    // Journaled and counted together, so a parked result reports exactly what landed.
    const land = (
      index: number,
      call: ProgramPlanCall,
      outcome: ProgramCallOutcome,
      kind: "executed" | "outcome_unknown"
    ) =>
      Effect.uninterruptible(
        Effect.gen(function* () {
          const completedAt = yield* nowIsoEffect;
          yield* journalEffect(
            api.appendEntry(programId, toJournalEntry(index, call, outcome, completedAt))
          );
          if (kind === "executed") executedCalls++;
          else outcomeUnknownCalls++;
          landed.set(index, outcome.record);
        })
      );

    const durableHost = yield* memoizeRiskEffect(host, plan);

    const hooks: ProgramCallHooks<DurableProgramRefusal> = {
      replay: (index, call) =>
        Effect.gen(function* () {
          const entry = entries.get(index);
          if (entry !== undefined) {
            if (!entryMatchesCall(entry, call, index)) {
              return yield* diverged(index, "journaled entry does not match the plan call");
            }
            if (host.replayed !== undefined) {
              yield* host
                .replayed(
                  { index, tool: call.tool, operationId: entry.operationId, ok: entry.result.ok },
                  { programId }
                )
                .pipe(
                  Effect.mapError(
                    (e) =>
                      new DurableProgramRefusal({
                        programId,
                        code: "replay_label_failed",
                        message: `replaying call ${index}: ${e.message}`,
                        fixHint:
                          "Journaled results are withheld until the host can label them; resume again.",
                      })
                  )
                );
            }
            yield* auditResult({
              toolName: call.tool,
              operationId: entry.operationId,
              ok: entry.result.ok,
              status: entry.result.status,
              index,
              replayed: true,
            });
            replayedCalls++;
            const outcome = replayedOutcome(programId, call, index, entry);
            landed.set(index, outcome.record);
            return Option.some(outcome);
          }
          if (replayOnly) {
            return yield* diverged(index, "completed journal has no entry for this call");
          }
          const intent = intents.get(index);
          if (intent !== undefined) {
            if (
              call.tool !== "execute" ||
              intent.callId !== callIdFor(call, index) ||
              intent.operationId !== call.operationId
            ) {
              return yield* diverged(index, "journaled intent does not match the plan call");
            }
            const outcome = outcomeUnknown(programId, call, index, intent);
            yield* land(index, call, outcome, "outcome_unknown");
            yield* auditResult({
              toolName: "execute",
              operationId: call.operationId,
              ok: false,
              status: "outcome_unknown",
              index,
            });
            return Option.some(outcome);
          }
          if (call.tool === "execute" && (yield* mayRunAsWriteEffect(call, durableHost))) {
            const intentAt = yield* nowIsoEffect;
            yield* journalEffect(
              api.appendIntent(programId, {
                index,
                callId: callIdFor(call, index),
                operationId: call.operationId,
                startedAt: intentAt,
              })
            );
          }
          return Option.none();
        }),
      completed: (index, call, outcome) =>
        Effect.gen(function* () {
          yield* land(index, call, outcome, "executed");
          if (crashAfter !== undefined && crashAfter > 0 && executedCalls >= crashAfter) {
            return yield* Effect.die(
              new ProgramCrashSimulated({ programId, afterCalls: executedCalls })
            );
          }
        }),
    };

    const run = runProgramPlanEffect(
      {
        programId,
        plan,
        timeoutMs: yield* resolveProgramTimeoutMsEffect(input.timeoutMs, ctx.caps),
        maxOutputBytes: ctx.caps.maxOutputBytes,
        sessionId: input.sessionId,
        startedAtMs: ctx.startedAtMs,
        honesty: DURABLE_PROGRAM_HONESTY,
        auditMetadata: { durable: true, resumed: ctx.resumed, journal: api.backend },
        hooks,
        env: ctx.env,
      },
      durableHost
    );

    const outcome = yield* (
      replayOnly
        ? run
        : Effect.onInterrupt(run, () =>
            api.markStatus(programId, "parked").pipe(Effect.catch(() => Effect.void))
          )
    ).pipe(Effect.result);

    if (Result.isFailure(outcome)) {
      const refusal = outcome.failure;
      if (refusal.code === "journal_divergence") {
        yield* api
          .markStatus(programId, "failed", { error: refusal.message })
          .pipe(Effect.catch(() => Effect.void));
      }
      const status = refusal.code === "journal_divergence" ? "failed" : journal.status;
      return refusalResult(refusal, Date.now() - ctx.startedAtMs, progress(status));
    }

    const result = outcome.success;
    const parked = result.diagnostics.timedOut === true;
    const status: ProgramJournalStatus = parked ? "parked" : "completed";
    if (!replayOnly) {
      const marked = yield* api.markStatus(programId, status).pipe(Effect.result);
      if (Result.isFailure(marked)) {
        return refusalResult(
          journalRefusal(marked.failure),
          Date.now() - ctx.startedAtMs,
          progress(journal.status)
        );
      }
    }
    const done = progress(status);
    return parked
      ? {
          ...result,
          calls: done.calls,
          diagnostics: { ...result.diagnostics, fixHint: PARKED_HINT, durable: done.durable },
        }
      : { ...result, diagnostics: { ...result.diagnostics, durable: done.durable } };
  });
}

/**
 * Start or resume a durable program on the {@link ProgramJournalService} in context.
 *
 * With `source` and no journal for `programId`, a journal is created and the plan
 * runs. With a journal, the program resumes: `source`, when given, must match the
 * journaled one, and the caller must present the session key that created it
 * (another caller gets `program_not_found`). A completed program replays its result
 * without calling the host or writing the journal. Refusals return `ok: false` with
 * `diagnostics.code`.
 */
export function runDurableProgramEffect(
  input: DurableProgramInput,
  host: ProgramHost,
  env: NodeJS.ProcessEnv = process.env,
  options: DurableProgramRunOptions = {}
): Effect.Effect<ExecuteProgramResult, never, ProgramJournalService> {
  return Effect.gen(function* () {
    const startedAtMs = Date.now();
    const elapsed = () => Date.now() - startedAtMs;
    return yield* Effect.gen(function* () {
      const api = yield* ProgramJournalService;
      const caps = yield* resolveProgramCapsEffect(env);
      const owner = yield* Effect.sync(() => resolveSessionLabelKey(input.sessionId, env));

      if (input.source === undefined && input.programId === undefined) {
        return yield* new DurableProgramRefusal({
          programId: "",
          code: "program_source_required",
          message: "source is required to start a program",
          fixHint: "Pass a JSON plan as source, or the programId of a program to resume.",
        });
      }
      const programId =
        input.programId === undefined
          ? yield* newProgramIdEffect()
          : yield* Effect.mapError(validateProgramIdEffect(input.programId), journalRefusal);

      let started: { readonly plan: ProgramPlan; readonly sourceHash: string } | undefined;
      if (input.source !== undefined) {
        const prepared = yield* prepareProgramPlanEffect(input.source, caps);
        if (!prepared.ok) {
          return yield* new DurableProgramRefusal({
            programId,
            code: "invalid_plan",
            message: prepared.error,
            fixHint: prepared.fixHint,
            mode: prepared.mode,
          });
        }
        started = { plan: prepared.plan, sourceHash: yield* hashProgramSourceEffect(input.source) };
      }

      const attempt = (journal: ProgramJournal, resumed: boolean) =>
        runAttemptEffect({
          api,
          journal,
          resumed,
          host,
          env,
          caps,
          input,
          options,
          startedAtMs,
        });

      const notFound = new DurableProgramRefusal({
        programId,
        code: "program_not_found",
        message: `no durable program ${programId} for this session`,
        fixHint: "Pass source to start a program under this id.",
      });

      return yield* api.withLease(
        programId,
        Effect.gen(function* () {
          const existing = yield* journalEffect(api.load(programId));
          if (existing === null) {
            if (started === undefined) return yield* notFound;
            const created = yield* journalEffect(api.create({ programId, owner, ...started }));
            return yield* attempt(created, false);
          }
          if (existing.owner !== owner) return yield* notFound;
          if (started !== undefined && started.sourceHash !== existing.sourceHash) {
            return yield* new DurableProgramRefusal({
              programId,
              code: "program_source_mismatch",
              message: `source does not match the journaled source of ${programId}`,
              fixHint: "Resume with the original source (or omit source), or use a new programId.",
            });
          }
          if (existing.status === "failed") {
            return yield* new DurableProgramRefusal({
              programId,
              code: "program_failed",
              message: existing.lastError ?? `program ${programId} failed`,
              fixHint: "A failed program cannot resume; start a new program.",
            });
          }
          const capped = yield* checkProgramPlanCapsEffect(existing.plan, caps);
          if (!capped.ok) {
            return yield* new DurableProgramRefusal({
              programId,
              code: "invalid_plan",
              message: capped.error,
              fixHint: capped.fixHint,
              mode: capped.mode,
            });
          }
          return yield* attempt(existing, true);
        })
      );
    }).pipe(
      Effect.mapError((e) => (e instanceof DurableProgramRefusal ? e : journalRefusal(e))),
      Effect.catch((refusal) => Effect.sync(() => refusalResult(refusal, elapsed())))
    );
  });
}

/** Resume a parked or crashed program from its journal; the plan comes from the journal. */
export function resumeProgramEffect(
  programId: string,
  host: ProgramHost,
  env: NodeJS.ProcessEnv = process.env,
  options: ResumeProgramOptions = {}
): Effect.Effect<ExecuteProgramResult, never, ProgramJournalService> {
  const { sessionId, timeoutMs, ...runOptions } = options;
  return runDurableProgramEffect({ programId, sessionId, timeoutMs }, host, env, runOptions);
}

/** {@link runDurableProgramEffect} on the journal `env` configures (MCP host boundary). */
export function executeDurableProgramEffect(
  input: DurableProgramInput,
  host: ProgramHost,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<ExecuteProgramResult> {
  return Effect.gen(function* () {
    const startedAtMs = Date.now();
    return yield* runDurableProgramEffect(input, host, env).pipe(
      Effect.provide(programJournalLayer(env)),
      Effect.catch((e) =>
        Effect.sync(() => refusalResult(journalRefusal(e), Date.now() - startedAtMs))
      )
    );
  });
}

export class DurableProgramRunnerService extends Context.Service<
  DurableProgramRunnerService,
  {
    readonly run: (
      input: DurableProgramInput,
      host: ProgramHost,
      env?: NodeJS.ProcessEnv,
      options?: DurableProgramRunOptions
    ) => Effect.Effect<ExecuteProgramResult>;
    readonly resume: (
      programId: string,
      host: ProgramHost,
      env?: NodeJS.ProcessEnv,
      options?: ResumeProgramOptions
    ) => Effect.Effect<ExecuteProgramResult>;
  }
>()("clawql/DurableProgramRunnerService") {}

/** Durable runner over the {@link ProgramJournalService} it is built with. */
export const DurableProgramRunnerLive: Layer.Layer<
  DurableProgramRunnerService,
  never,
  ProgramJournalService
> = Layer.effect(
  DurableProgramRunnerService,
  Effect.gen(function* () {
    const journal = yield* ProgramJournalService;
    return DurableProgramRunnerService.of({
      run: (input, host, env, options) =>
        Effect.provideService(
          runDurableProgramEffect(input, host, env, options),
          ProgramJournalService,
          journal
        ),
      resume: (programId, host, env, options) =>
        Effect.provideService(
          resumeProgramEffect(programId, host, env, options),
          ProgramJournalService,
          journal
        ),
    });
  })
);
