import { WORMAuditTrailService } from "clawql-audit";
import type { AuditError } from "clawql-audit";
import { Data, Effect, Ref } from "effect";
import type { ATRScope, AgentSession } from "../../shared/types.js";
import type { OpenHandsHookEvent } from "./worm-hooks.js";
import { openHandsHookToWormAppend } from "./worm-hooks.js";

export class BudgetExhaustedError extends Data.TaggedError("BudgetExhaustedError")<{
  readonly tokenCount: number;
  readonly costUsd: number;
  readonly turnCount: number;
  readonly sessionId: string;
}> {}

export type BudgetCheckError = BudgetExhaustedError | AuditError;
export type OpenHandsInferenceEvent = {
  readonly type: "agent:inference";
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
};

export type BudgetEnforcerState = {
  readonly tokenCount: number;
  readonly costUsd: number;
  readonly turnCount: number;
  readonly exhausted: boolean;
};

/**
 * OpenHands event-stream budget enforcer — virtual key ceilings at the stream layer.
 */
export const makeOpenHandsBudgetEnforcer = (input: {
  readonly budget: ATRScope["budget"];
  readonly session: AgentSession;
}) =>
  Effect.gen(function* () {
    const stateRef = yield* Ref.make<BudgetEnforcerState>({
      tokenCount: 0,
      costUsd: 0,
      turnCount: 0,
      exhausted: false,
    });

    const checkBudget = (
      event: OpenHandsInferenceEvent
    ): Effect.Effect<BudgetEnforcerState, BudgetCheckError, WORMAuditTrailService> =>
      Effect.gen(function* () {
        const next = yield* Ref.updateAndGet(stateRef, (s) => {
          if (s.exhausted) return s;
          return {
            tokenCount: s.tokenCount + event.inputTokens + event.outputTokens,
            costUsd: s.costUsd + event.costUsd,
            turnCount: s.turnCount + 1,
            exhausted: false,
          };
        });

        const overTokens = next.tokenCount > input.budget.maxTokens;
        const overUsd = next.costUsd > input.budget.maxUsd;
        const overTurns = next.turnCount > input.budget.maxTurns;

        if (overTokens || overUsd || overTurns) {
          yield* Ref.update(stateRef, (s) => ({ ...s, exhausted: true }));
          const worm = yield* WORMAuditTrailService;
          const hook: OpenHandsHookEvent = {
            kind: "budget_exhausted",
            sessionId: input.session.sessionId,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            costUsd: event.costUsd,
            metadata: {
              tokenCount: next.tokenCount,
              costUsd: next.costUsd,
              turnCount: next.turnCount,
              budget: input.budget,
              partialWork: true,
            },
          };
          yield* worm.append(openHandsHookToWormAppend(hook));
          return yield* Effect.fail(
            new BudgetExhaustedError({
              tokenCount: next.tokenCount,
              costUsd: next.costUsd,
              turnCount: next.turnCount,
              sessionId: input.session.sessionId,
            })
          );
        }

        return next;
      });

    const snapshot = () => Ref.get(stateRef);

    return { checkBudget, snapshot } as const;
  });
