import { Effect, Layer } from "effect";
import { getAdapterBundle, IMPLEMENTED_AGENTS } from "../get-adapter.js";
import {
  AgentAdapter,
  type AgentName,
  type AgentWormError,
  type ATRScope,
  type ClawQLAgentConfig,
} from "../shared/types.js";

export type BenchmarkFamily = "S" | "M" | "P";

export type BenchmarkTask = {
  readonly id: string;
  readonly family: BenchmarkFamily;
  readonly title: string;
  readonly atrScope: ATRScope;
};

export type ArmResult = {
  readonly ok: boolean;
  readonly tokens: number;
  readonly cpr: number;
  readonly wormComplete: boolean;
  readonly notes?: string;
};

export type TaskResult = {
  readonly taskId: string;
  readonly baseline: ArmResult;
  readonly clawql: ArmResult;
  readonly delta: {
    readonly cprLift: number;
    readonly tokenReduction: number;
    readonly wormComplete: boolean;
  };
};

export type BenchmarkScorecard = {
  readonly agentName: AgentName;
  readonly family: BenchmarkFamily;
  readonly results: readonly TaskResult[];
};

const stubArm = (wormComplete: boolean): ArmResult => ({
  ok: true,
  tokens: wormComplete ? 800 : 1200,
  cpr: wormComplete ? 0.85 : 0.55,
  wormComplete,
  notes: "stub arm — replace when Agents OpenBench live gates clear",
});

/**
 * Dry-run OpenBench-shaped scorecard: session start/stop under ATR + stub CPR/token arms.
 */
export const runAgentBenchmarkDry = (input: {
  readonly agentName: AgentName;
  readonly family: BenchmarkFamily;
  readonly tasks: readonly BenchmarkTask[];
  readonly config: ClawQLAgentConfig;
}): Effect.Effect<BenchmarkScorecard, AgentWormError> =>
  Effect.gen(function* () {
    const { wormLayer, adapterLayer } = yield* getAdapterBundle(
      input.agentName,
      input.config.wormDbPath
    );
    const layer = Layer.merge(wormLayer, adapterLayer);
    const results: TaskResult[] = [];

    for (const task of input.tasks) {
      const taskResult = yield* Effect.gen(function* () {
        const adapter = yield* AgentAdapter;
        yield* adapter.initialize(input.config);
        const session = yield* adapter.start(task.atrScope);
        yield* adapter.stop(session);
        const baseline = stubArm(false);
        const clawql = stubArm(true);
        return {
          taskId: task.id,
          baseline,
          clawql,
          delta: {
            cprLift: clawql.cpr - baseline.cpr,
            tokenReduction: 1 - clawql.tokens / baseline.tokens,
            wormComplete: clawql.wormComplete,
          },
        } satisfies TaskResult;
      }).pipe(Effect.provide(layer));
      results.push(taskResult);
    }

    return {
      agentName: input.agentName,
      family: input.family,
      results,
    };
  });

export const catalogAgentsForBench = (): readonly AgentName[] => IMPLEMENTED_AGENTS;
