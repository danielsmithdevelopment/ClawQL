/**
 * Effect Tag + Layer: park mandate executes and resume after human approval.
 */

import { Context, Effect, Layer } from "effect";
import { appendProcessWormEffect } from "clawql-audit";
import type { OperationRisk } from "../risk/operation-risk-types.js";
import { resolveClawqlHome } from "../spec/custom-sources-store.js";
import { hashPendingArgsEffect } from "./args-hash.js";
import {
  newExecutionIdEffect,
  pendingTtlHours,
  readPendingExecutionEffect,
  updatePendingStatusEffect,
  writePendingExecutionEffect,
} from "./pending-execution-store.js";
import type { ParkExecuteResult, PendingExecutionRecord } from "./pending-execution-types.js";

export type ParkInput = {
  readonly operationId: string;
  readonly args: Record<string, unknown>;
  readonly fields?: readonly string[];
  readonly risk: OperationRisk;
  readonly home?: string;
};

export type ResumeDecision = "approve" | "decline";

export class PendingExecutionService extends Context.Service<PendingExecutionService, {
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
    readonly markCompleted: (
      executionId: string,
      outcome: { readonly ok: boolean; readonly error?: string },
      home?: string
    ) => Effect.Effect<PendingExecutionRecord, Error>;
  }>()("clawql/PendingExecutionService") {}

function isExpired(record: PendingExecutionRecord, now = Date.now()): boolean {
  return Date.parse(record.expiresAt) <= now;
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

    markCompleted: (executionId, outcome, homeOpt) =>
      updatePendingStatusEffect(
        executionId,
        {
          status: outcome.ok ? "completed" : "failed",
          completedAt: new Date().toISOString(),
          lastError: outcome.ok ? null : (outcome.error ?? "execute failed"),
        },
        homeOpt ?? resolveClawqlHome()
      ),
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
