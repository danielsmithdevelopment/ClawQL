import type { AuditError } from "clawql-audit";
import { Effect } from "effect";
import { ClawQLHarness, type BenchmarkTask, type HarnessComparisonResult, type HarnessNotStartedError, type HarnessPlugin, type HarnessPluginError, type ModelConfig } from "../src/index.js";

export type CompareHarnessesInput = {
  readonly task: BenchmarkTask;
  readonly model: ModelConfig;
  readonly plugins: readonly HarnessPlugin[];
  readonly wormDbPath?: string;
};

/**
 * Run identical task/model through each harness plugin plus a zero-plugin baseline.
 */
export const compareHarnesses = (
  input: CompareHarnessesInput
): Effect.Effect<HarnessComparisonResult, HarnessPluginError | HarnessNotStartedError | AuditError> =>
  Effect.gen(function* () {
    const baselineHarness = yield* ClawQLHarness.create({
      plugins: [],
      model: input.model,
      wormDbPath: input.wormDbPath,
    });
    const baseline = yield* baselineHarness.run(input.task);
    yield* baselineHarness.teardown();

    const pluginResults = yield* Effect.forEach(input.plugins, (plugin) =>
      Effect.gen(function* () {
        const harness = yield* ClawQLHarness.create({
          plugins: [plugin],
          model: input.model,
          wormDbPath: input.wormDbPath,
        });
        const result = yield* harness.run(input.task);
        yield* harness.teardown();
        return { pluginId: plugin.id, result };
      })
    );

    return {
      baseline,
      plugins: pluginResults,
    };
  });
