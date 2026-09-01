import { Effect, Layer } from "effect";
import { getAdapterBundle, IMPLEMENTED_AGENTS } from "../get-adapter.js";
import {
  AgentAdapter,
  type AgentName,
  type AgentWormError,
  type ATRScope,
  type ClawQLAgentConfig,
} from "../shared/types.js";
import { runFamilySScopeChecks, type FamilySCheckReport } from "./family-s-checks.js";

export type BenchmarkFamily = "S" | "M" | "P";

export type BenchmarkTask = {
  readonly id: string;
  readonly family: BenchmarkFamily;
  readonly title: string;
  readonly atrScope: ATRScope;
  /** When true (default for family S), run ATR deny/allow checkers instead of stub CPR. */
  readonly scopeChecks?: boolean;
};

export type ArmResult = {
  readonly ok: boolean;
  readonly tokens: number;
  readonly cpr: number;
  readonly wormComplete: boolean;
  readonly notes?: string;
  readonly familyS?: FamilySCheckReport;
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

const armFromFamilyS = (report: FamilySCheckReport, tokens: number): ArmResult => ({
  ok: report.enforce ? report.wormComplete : true,
  tokens,
  cpr: report.cpr,
  wormComplete: report.wormComplete,
  notes: report.enforce
    ? "Family S: ATR enforceToolCall + harness stubs"
    : "Family S baseline: no ATR gate",
  familyS: report,
});

/**
 * Dry-run OpenBench-shaped scorecard.
 * Family S tasks with scope checks (default) exercise real ATR deny/allow via Panguard + harness stubs.
 * M/P (and S with scopeChecks:false) keep stub CPR/token arms until live gates clear.
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

    return yield* Effect.gen(function* () {
      const results: TaskResult[] = [];

      for (const task of input.tasks) {
        const useScopeChecks = task.scopeChecks ?? (task.family === "S" || input.family === "S");
        const atrScope: ATRScope = task.atrScope;

        const adapter = yield* AgentAdapter;
        yield* adapter.initialize(input.config);
        const session = yield* adapter.start(atrScope);

        let baseline: ArmResult;
        let clawql: ArmResult;

        if (useScopeChecks) {
          const baselineReport = yield* runFamilySScopeChecks({
            atrScope,
            sessionId: session.sessionId,
            agentName: input.agentName,
            virtualKeyId: input.config.virtualKeyId,
            enforce: false,
          });
          const clawqlReport = yield* runFamilySScopeChecks({
            atrScope,
            sessionId: session.sessionId,
            agentName: input.agentName,
            virtualKeyId: input.config.virtualKeyId,
            enforce: true,
          });
          baseline = armFromFamilyS(baselineReport, 1200);
          clawql = armFromFamilyS(clawqlReport, 800);
        } else {
          baseline = stubArm(false);
          clawql = stubArm(true);
        }

        yield* adapter.stop(session);
        results.push({
          taskId: task.id,
          baseline,
          clawql,
          delta: {
            cprLift: clawql.cpr - baseline.cpr,
            tokenReduction: 1 - clawql.tokens / baseline.tokens,
            wormComplete: clawql.wormComplete,
          },
        });
      }

      return {
        agentName: input.agentName,
        family: input.family,
        results,
      };
    }).pipe(Effect.provide(layer));
  });

export const catalogAgentsForBench = (): readonly AgentName[] => IMPLEMENTED_AGENTS;
