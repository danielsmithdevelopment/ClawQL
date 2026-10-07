/**
 * Effect Tag + Layer: park mandate executes and resume after human approval.
 * Consume is atomic (approved → outcome_unknown) before any side effect.
 */

import { hostname } from "node:os";
import { Context, Effect, Layer } from "effect";
import { appendProcessWormEffect } from "clawql-audit";
import type { OperationRisk } from "../risk/operation-risk-types.js";
import { resolveClawqlHome } from "../spec/custom-sources-store.js";
import { hashPendingArgsEffect } from "./args-hash.js";
import {
  newExecutionIdEffect,
  pendingTtlHours,
  readPendingExecutionEffect,
  tryConsumeApprovedEffect,
  updatePendingStatusEffect,
  writePendingExecutionEffect,
} from "./pending-execution-store.js";
import {
  mandateIdempotencyKey,
  type OutcomeUnknownResolve,
  type ParkExecuteResult,
  type PendingExecutionRecord,
} from "./pending-execution-types.js";

export type ParkInput = {
  readonly operationId: string;
  readonly args: Record<string, unknown>;
  readonly fields?: readonly string[];
  readonly risk: OperationRisk;
  readonly home?: string;
  /** Override: connector honors Idempotency-Key (Stripe, etc.). */
  readonly idempotencyCapable?: boolean;
};

export type ResumeDecision = "approve" | "decline";

export type ConsumeApprovedInput = {
  readonly executionId: string;
  readonly argsHash: string;
  readonly home?: string;
  readonly consumedBy?: string;
  readonly nowMs?: number;
};

export class PendingExecutionService extends Context.Service<
  PendingExecutionService,
  {
    readonly park: (input: ParkInput) => Effect.Effect<ParkExecuteResult, Error>;
    readonly load: (
      executionId: string,
      home?: string
    ) => Effect.Effect<PendingExecutionRecord | null, Error>;
    readonly decide: (
      executionId: string,
      decision: ResumeDecision,
      home?: string
    ) => Effect.Effect<PendingExecutionRecord, Error>;
    /** Atomic one-shot consume. Null = refuse (already consumed, mismatch, expired). */
    readonly tryConsume: (
      input: ConsumeApprovedInput
    ) => Effect.Effect<PendingExecutionRecord | null, Error>;
    readonly markCompleted: (
      executionId: string,
      outcome: { readonly ok: boolean; readonly error?: string },
      home?: string
    ) => Effect.Effect<PendingExecutionRecord, Error>;
    /** Human resolve for stuck outcome_unknown (Review). */
    readonly resolveOutcomeUnknown: (
      executionId: string,
      resolution: OutcomeUnknownResolve,
      home?: string
    ) => Effect.Effect<PendingExecutionRecord, Error>;
  }
>()("clawql/PendingExecutionService") {}

/** Automatic retry only when the parked op's connector is idempotency-capable. */
export function mayAutoRetryOutcomeUnknown(record: PendingExecutionRecord): boolean {
  return record.status === "outcome_unknown" && record.idempotencyCapable === true;
}

function isExpired(record: PendingExecutionRecord, now = Date.now()): boolean {
  return Date.parse(record.expiresAt) <= now;
}

function defaultConsumedBy(): string {
  return `host:${hostname()}:pid:${process.pid}`;
}

export const PendingExecutionLive = Layer.succeed(
  PendingExecutionService,
  PendingExecutionService.of({
    park: (input) =>
      Effect.gen(function* () {
        const home = input.home ?? resolveClawqlHome();
        const executionId = yield* newExecutionIdEffect();
        const argsHash = yield* hashPendingArgsEffect({
          operationId: input.operationId,
          args: input.args,
          fields: input.fields,
        });
        const createdAt = new Date().toISOString();
        const expiresAt = new Date(Date.now() + pendingTtlHours() * 60 * 60 * 1000).toISOString();
        const record: PendingExecutionRecord = {
          version: 1,
          executionId,
          operationId: input.operationId,
          args: input.args,
          fields: input.fields ? [...input.fields] : null,
          argsHash,
          risk: input.risk,
          status: "pending",
          createdAt,
          expiresAt,
          approvedAt: null,
          completedAt: null,
          lastError: null,
          consumedAt: null,
          consumedBy: null,
          idempotencyCapable: input.idempotencyCapable === true,
        };
        yield* writePendingExecutionEffect(record, home);
        yield* appendProcessWormEffect({
          type: "HUMAN_DECISION_REQUESTED",
          timestamp: createdAt,
          sessionId: process.env.CLAWQL_SESSION_ID?.trim() || "pending-execute",
          metadata: {
            executionId,
            operationId: input.operationId,
            argsHash,
            riskPolicy: input.risk.policy,
            riskLevel: input.risk.level,
            expiresAt,
            idempotencyKey: mandateIdempotencyKey(executionId),
          },
        });
        return {
          ok: false as const,
          status: "mandate_required" as const,
          reason: "Operation risk policy requires a mandate before execute",
          operationId: input.operationId,
          executionId,
          argsHash,
          risk: input.risk,
          approval: {
            cli: `clawql resume ${executionId}`,
            tool: "resume" as const,
            declineCli: `clawql resume --decline ${executionId}`,
          },
          expiresAt,
        };
      }),

    load: (executionId, home) =>
      readPendingExecutionEffect(executionId, home ?? resolveClawqlHome()),

    decide: (executionId, decision, homeOpt) =>
      Effect.gen(function* () {
        const home = homeOpt ?? resolveClawqlHome();
        const record = yield* readPendingExecutionEffect(executionId, home);
        if (!record) {
          return yield* Effect.fail(new Error(`Unknown executionId: ${executionId}`));
        }
        if (record.status !== "pending") {
          return yield* Effect.fail(
            new Error(`Execution ${executionId} is not pending (status=${record.status})`)
          );
        }
        if (isExpired(record)) {
          const expired = yield* updatePendingStatusEffect(
            executionId,
            { status: "expired", lastError: "pending execution expired" },
            home
          );
          return yield* Effect.fail(
            new Error(`Execution ${executionId} expired at ${expired.expiresAt}`)
          );
        }

        const expectedHash = yield* hashPendingArgsEffect({
          operationId: record.operationId,
          args: record.args,
          fields: record.fields ?? undefined,
        });
        if (expectedHash !== record.argsHash) {
          return yield* Effect.fail(
            new Error(`argsHash mismatch for ${executionId} — parked payload was tampered`)
          );
        }

        const now = new Date().toISOString();
        if (decision === "decline") {
          const declined = yield* updatePendingStatusEffect(
            executionId,
            { status: "declined", approvedAt: null, completedAt: now },
            home
          );
          yield* appendProcessWormEffect({
            type: "HUMAN_REJECTION",
            timestamp: now,
            sessionId: process.env.CLAWQL_SESSION_ID?.trim() || "pending-execute",
            metadata: { executionId, operationId: record.operationId, argsHash: record.argsHash },
          });
          return declined;
        }

        const approved = yield* updatePendingStatusEffect(
          executionId,
          { status: "approved", approvedAt: now },
          home
        );
        yield* appendProcessWormEffect({
          type: "HUMAN_APPROVAL",
          timestamp: now,
          sessionId: process.env.CLAWQL_SESSION_ID?.trim() || "pending-execute",
          metadata: { executionId, operationId: record.operationId, argsHash: record.argsHash },
        });
        return approved;
      }),

    tryConsume: (input) =>
      Effect.gen(function* () {
        const home = input.home ?? resolveClawqlHome();
        const consumed = yield* tryConsumeApprovedEffect(
          input.executionId,
          {
            argsHash: input.argsHash,
            consumedBy: input.consumedBy ?? defaultConsumedBy(),
            nowMs: input.nowMs,
          },
          home
        );
        if (!consumed) return null;
        const ts = consumed.consumedAt ?? new Date().toISOString();
        yield* appendProcessWormEffect({
          type: "MANDATE_CONSUMED",
          timestamp: ts,
          sessionId: process.env.CLAWQL_SESSION_ID?.trim() || "pending-execute",
          metadata: {
            executionId: consumed.executionId,
            operationId: consumed.operationId,
            argsHash: consumed.argsHash,
            consumedBy: consumed.consumedBy,
            status: consumed.status,
            idempotencyKey: mandateIdempotencyKey(consumed.executionId),
            outcome: "unknown",
          },
        });
        return consumed;
      }),

    markCompleted: (executionId, outcome, homeOpt) =>
      Effect.gen(function* () {
        const home = homeOpt ?? resolveClawqlHome();
        const existing = yield* readPendingExecutionEffect(executionId, home);
        if (!existing) {
          return yield* Effect.fail(new Error(`Unknown executionId: ${executionId}`));
        }
        if (existing.status === "completed" || existing.status === "failed") {
          return existing;
        }
        if (existing.status !== "outcome_unknown") {
          return yield* Effect.fail(
            new Error(
              `Execution ${executionId} cannot finalize from status=${existing.status} (expected outcome_unknown)`
            )
          );
        }
        const completedAt = new Date().toISOString();
        const next = yield* updatePendingStatusEffect(
          executionId,
          {
            status: outcome.ok ? "completed" : "failed",
            completedAt,
            lastError: outcome.ok ? null : (outcome.error ?? "execute failed"),
          },
          home
        );
        yield* appendProcessWormEffect({
          type: outcome.ok ? "MANDATE_FINALIZED" : "MANDATE_FINALIZED",
          timestamp: completedAt,
          sessionId: process.env.CLAWQL_SESSION_ID?.trim() || "pending-execute",
          metadata: {
            executionId,
            operationId: existing.operationId,
            argsHash: existing.argsHash,
            ok: outcome.ok,
            error: outcome.error ?? null,
            idempotencyKey: mandateIdempotencyKey(executionId),
          },
        });
        return next;
      }),

    resolveOutcomeUnknown: (executionId, resolution, homeOpt) =>
      Effect.gen(function* () {
        const home = homeOpt ?? resolveClawqlHome();
        const existing = yield* readPendingExecutionEffect(executionId, home);
        if (!existing) {
          return yield* Effect.fail(new Error(`Unknown executionId: ${executionId}`));
        }
        if (existing.status !== "outcome_unknown") {
          return yield* Effect.fail(
            new Error(`Execution ${executionId} is not outcome_unknown (status=${existing.status})`)
          );
        }
        if (resolution === "mark_applied" || resolution === "mark_not_applied") {
          const completedAt = new Date().toISOString();
          const ok = resolution === "mark_applied";
          const next = yield* updatePendingStatusEffect(
            executionId,
            {
              status: ok ? "completed" : "failed",
              completedAt,
              lastError: ok ? null : "operator marked not applied",
            },
            home
          );
          yield* appendProcessWormEffect({
            type: "MANDATE_FINALIZED",
            timestamp: completedAt,
            sessionId: process.env.CLAWQL_SESSION_ID?.trim() || "pending-execute",
            metadata: {
              executionId,
              operationId: existing.operationId,
              argsHash: existing.argsHash,
              ok,
              error: ok ? null : "operator marked not applied",
              idempotencyKey: mandateIdempotencyKey(executionId),
              resolvedBy: "operator",
            },
          });
          return next;
        }
        // retry_with_key — authorize re-drive with Idempotency-Key; never a second consume.
        if (!existing.idempotencyCapable) {
          return yield* Effect.fail(
            new Error(
              `Retry with key refused: operation ${existing.operationId} is not idempotency-capable. Mark applied or not applied instead.`
            )
          );
        }
        const now = new Date().toISOString();
        yield* appendProcessWormEffect({
          type: "MANDATE_RETRY_AUTHORIZED",
          timestamp: now,
          sessionId: process.env.CLAWQL_SESSION_ID?.trim() || "pending-execute",
          metadata: {
            executionId,
            operationId: existing.operationId,
            argsHash: existing.argsHash,
            idempotencyKey: mandateIdempotencyKey(executionId),
            authorizedBy: "operator",
          },
        });
        return existing;
      }),
  })
);

/** Host façade for execute-core park path. */
export async function parkMandateExecute(input: ParkInput): Promise<ParkExecuteResult> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const svc = yield* PendingExecutionService;
      return yield* svc.park(input);
    }).pipe(Effect.provide(PendingExecutionLive))
  );
}

export async function decidePendingExecution(
  executionId: string,
  decision: ResumeDecision,
  home?: string
): Promise<PendingExecutionRecord> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const svc = yield* PendingExecutionService;
      return yield* svc.decide(executionId, decision, home);
    }).pipe(Effect.provide(PendingExecutionLive))
  );
}

export async function loadPendingExecution(
  executionId: string,
  home?: string
): Promise<PendingExecutionRecord | null> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const svc = yield* PendingExecutionService;
      return yield* svc.load(executionId, home);
    }).pipe(Effect.provide(PendingExecutionLive))
  );
}

export async function tryConsumeApprovedMandate(
  input: ConsumeApprovedInput
): Promise<PendingExecutionRecord | null> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const svc = yield* PendingExecutionService;
      return yield* svc.tryConsume(input);
    }).pipe(Effect.provide(PendingExecutionLive))
  );
}

export async function markPendingCompleted(
  executionId: string,
  outcome: { readonly ok: boolean; readonly error?: string },
  home?: string
): Promise<PendingExecutionRecord> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const svc = yield* PendingExecutionService;
      return yield* svc.markCompleted(executionId, outcome, home);
    }).pipe(Effect.provide(PendingExecutionLive))
  );
}

export async function resolvePendingOutcomeUnknown(
  executionId: string,
  resolution: OutcomeUnknownResolve,
  home?: string
): Promise<PendingExecutionRecord> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const svc = yield* PendingExecutionService;
      return yield* svc.resolveOutcomeUnknown(executionId, resolution, home);
    }).pipe(Effect.provide(PendingExecutionLive))
  );
}
