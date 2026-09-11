/**
 * Execute-batching — named sandboxed scripts (spec v0.1).
 * @see docs/specs/execute/execute-batching-v0.1.md
 */

import { randomUUID } from "node:crypto";
import { Context, Data, Effect, Layer, Ref } from "effect";
import { ClawQLError } from "../errors/clawql-error.js";
import { fireHooksForEvent, atrScopeFromTokens } from "../plugin/hook-runtime.js";
import type { HookResult, LifecycleHook } from "../plugin/provider-types.js";
import { SecurityError, WormAuditSink } from "../plugin/provider-types.js";

export type ExecuteBatchPaymentFields = {
  readonly kind: "outbound_payment";
  readonly protocol: "x402" | "mpp";
  readonly resourceUrl: string;
  readonly method: string;
  readonly quoteDigest: string;
  readonly amount: string;
  readonly asset: string;
  readonly network: string;
  readonly payer: string;
  readonly payee: string;
  readonly txHash?: string;
  readonly facilitator: string;
  readonly hookDecision: "allow" | "deny" | "hitl";
  readonly hookPolicyVersion: string;
  readonly tenantId: string;
  readonly agentId: string;
  readonly sessionId: string;
};

export type ExecuteBatchCompletedFields = {
  readonly batchId: string;
  readonly batchName: string;
  readonly tenantId: string;
  readonly agentId: string;
  readonly sessionId: string;
  readonly innerCallCount: number;
  readonly success: boolean;
  readonly failureReason?: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly payment?: ExecuteBatchPaymentFields;
};

export type ExecuteBatchArgs = {
  readonly tenantId: string;
  readonly agentId: string;
  readonly sessionId: string;
  readonly atrTokens?: readonly string[];
  readonly payload?: unknown;
};

export type ExecuteBatchResult = {
  readonly terminal: unknown;
  readonly batch: ExecuteBatchCompletedFields;
};

export type ExecuteBatchScript = {
  readonly name: string;
  readonly description?: string;
  readonly run: (args: ExecuteBatchArgs) => Effect.Effect<ExecuteBatchResult, ClawQLError | Error>;
};

export class ExecuteBatchError extends Data.TaggedError("ExecuteBatchError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class ExecuteBatchRegistry extends Context.Tag("clawql/ExecuteBatchRegistry")<
  ExecuteBatchRegistry,
  {
    readonly register: (script: ExecuteBatchScript) => Effect.Effect<void, never>;
    readonly get: (name: string) => Effect.Effect<ExecuteBatchScript | undefined, never>;
    readonly list: () => Effect.Effect<readonly string[], never>;
  }
>() {}

export function createMemoryExecuteBatchRegistryLayer(
  seed: readonly ExecuteBatchScript[] = []
): Layer.Layer<ExecuteBatchRegistry> {
  return Layer.effect(
    ExecuteBatchRegistry,
    Effect.gen(function* () {
      const map = yield* Ref.make(new Map(seed.map((s) => [s.name, s] as const)));
      return ExecuteBatchRegistry.of({
        register: (script) =>
          Ref.update(map, (m) => {
            const copy = new Map(m);
            copy.set(script.name, script);
            return copy;
          }),
        get: (name) =>
          Effect.gen(function* () {
            const m = yield* Ref.get(map);
            return m.get(name);
          }),
        list: () =>
          Effect.gen(function* () {
            const m = yield* Ref.get(map);
            return [...m.keys()].sort();
          }),
      });
    })
  );
}

export type RunNamedBatchInput = {
  readonly batchName: string;
  readonly args: ExecuteBatchArgs;
  /** Optional pre-execute hooks (e.g. spend-cap-enforce). */
  readonly hooks?: readonly (LifecycleHook & { readonly pluginId: string })[];
};

/**
 * Run a named batch: WORM start → pre-execute hooks → script → WORM complete/abort.
 */
export function runNamedExecuteBatch(
  input: RunNamedBatchInput
): Effect.Effect<
  ExecuteBatchResult,
  ClawQLError | ExecuteBatchError | SecurityError | Error,
  ExecuteBatchRegistry | WormAuditSink
> {
  return Effect.gen(function* () {
    const registry = yield* ExecuteBatchRegistry;
    const worm = yield* WormAuditSink;
    const script = yield* registry.get(input.batchName);
    if (!script) {
      return yield* Effect.fail(
        new ExecuteBatchError({ reason: `batch_not_registered:${input.batchName}` })
      );
    }

    const batchId = randomUUID();
    const startedAt = new Date().toISOString();
    yield* worm.append({
      type: "EXECUTE_BATCH_STARTED",
      batchId,
      batchName: input.batchName,
      tenantId: input.args.tenantId,
      agentId: input.args.agentId,
      sessionId: input.args.sessionId,
      timestamp: startedAt,
    });

    const hooks = input.hooks ?? [];
    if (hooks.length > 0) {
      const hookCtx = {
        session: {
          id: input.args.sessionId,
          atrScope: atrScopeFromTokens(input.args.atrTokens ?? []),
        },
        toolName: input.batchName,
        args: input.args.payload ?? input.args,
      };
      const hookResult: HookResult = yield* fireHooksForEvent(hooks, hookCtx, {
        stopOnDeny: true,
      });
      if (!hookResult.allow) {
        const completedAt = new Date().toISOString();
        const batch: ExecuteBatchCompletedFields = {
          batchId,
          batchName: input.batchName,
          tenantId: input.args.tenantId,
          agentId: input.args.agentId,
          sessionId: input.args.sessionId,
          innerCallCount: 0,
          success: false,
          failureReason: hookResult.denyReason ?? "hook_blocked",
          startedAt,
          completedAt,
        };
        yield* worm.append({
          type: "EXECUTE_BATCH_ABORTED",
          ...batch,
          timestamp: completedAt,
        });
        return yield* Effect.fail(
          new ExecuteBatchError({
            reason: `hook_blocked:${hookResult.denyReason ?? "denied"}`,
          })
        );
      }
    }

    const result = yield* script.run(input.args).pipe(
      Effect.mapError(
        (cause) =>
          new ExecuteBatchError({
            reason: `batch_failed:${input.batchName}`,
            cause,
          })
      )
    );

    yield* worm.append({
      type: result.batch.success ? "EXECUTE_BATCH_COMPLETED" : "EXECUTE_BATCH_ABORTED",
      ...result.batch,
      timestamp: result.batch.completedAt,
    });

    return result;
  });
}
