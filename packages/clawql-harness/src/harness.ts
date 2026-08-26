import { WORMAuditTrail, type WormStorageError } from "clawql-audit";
import { Effect, Layer } from "effect";
import {
  makeHarnessWormLayer,
  registerHarnessPlugins,
  runLoopHandlers,
  teardownHarnessPlugins,
  type HarnessRegistryState,
} from "./registry.js";
import type {
  ClawQLHarnessConfig,
  HarnessNotStartedError,
  HarnessPluginError,
  HarnessRunResult,
  HarnessTask,
  LoopState,
} from "./types.js";
import { HarnessNotStartedError as HarnessNotStartedErrorClass } from "./types.js";
import { verifyHarnessWormTrail } from "./worm-bridge.js";

export type ClawQLHarness = {
  readonly config: ClawQLHarnessConfig;
  readonly state: HarnessRegistryState;
  readonly layer: Layer.Layer<WORMAuditTrail, WormStorageError, never>;
  run: (task: HarnessTask) => Effect.Effect<HarnessRunResult, HarnessPluginError | HarnessNotStartedError | WormStorageError>;
  teardown: () => Effect.Effect<void, HarnessPluginError | WormStorageError>;
};

const initialLoopState = (): LoopState => ({
  turn: 0,
  history: [],
});

export const createClawQLHarness = (
  config: ClawQLHarnessConfig
): Effect.Effect<ClawQLHarness, HarnessPluginError | WormStorageError> =>
  Effect.gen(function* () {
    const wormLayer = makeHarnessWormLayer(config.wormDbPath);
    const state = yield* registerHarnessPlugins(config).pipe(Effect.provide(wormLayer));

    const runTask = (task: HarnessTask) =>
      Effect.gen(function* () {
        if (!state.started) {
          return yield* Effect.fail(
            new HarnessNotStartedErrorClass({ reason: "harness not started" })
          );
        }

        const maxTurns = task.maxTurns ?? 3;
        let loopState = initialLoopState();

        loopState = yield* runLoopHandlers("plan", state, loopState);
        loopState = {
          ...loopState,
          history: [
            ...loopState.history,
            { turn: loopState.turn, phase: "plan" as const, note: task.title },
          ],
        };

        for (let turn = 1; turn <= maxTurns; turn++) {
          loopState = { ...loopState, turn };
          loopState = yield* runLoopHandlers("act", state, loopState);
          loopState = {
            ...loopState,
            history: [...loopState.history, { turn, phase: "act" as const }],
          };
          loopState = yield* runLoopHandlers("observe", state, loopState);
          loopState = {
            ...loopState,
            history: [...loopState.history, { turn, phase: "observe" as const }],
          };
          loopState = yield* runLoopHandlers("evaluate", state, loopState);
          loopState = {
            ...loopState,
            history: [...loopState.history, { turn, phase: "evaluate" as const }],
          };
        }

        const wormComplete = yield* verifyHarnessWormTrail(state);

        return {
          taskId: task.id,
          turns: maxTurns,
          finalState: loopState,
          registeredTools: [...state.tools.keys()],
          wormComplete,
        } satisfies HarnessRunResult;
      }).pipe(Effect.provide(wormLayer));

    const teardown = () =>
      teardownHarnessPlugins(state).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            (state as { started: boolean }).started = false;
          })
        ),
        Effect.provide(wormLayer)
      );

    return {
      config,
      state,
      layer: wormLayer,
      run: runTask,
      teardown,
    };
  });

/** Spec alias */
export const ClawQLHarness = {
  create: createClawQLHarness,
};
