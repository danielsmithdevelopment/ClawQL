/**
 * Effect Tag + Layer for operation risk classification and override application.
 */

import { Context, Effect, Layer } from "effect";
import { appendProcessWormEffect } from "clawql-audit";
import type { Operation } from "../spec/operation-types.js";
import { classifyOperationRiskEffect } from "./classify-operation-risk.js";
import {
  readOperationRiskConfigEffect,
  trustedMcpSourcesFromEnvEffect,
} from "./operation-risk-overrides.js";
import {
  levelForPolicy,
  type OperationRisk,
  type OperationRiskConfigFile,
} from "./operation-risk-types.js";
import { resolveClawqlHome } from "../spec/custom-sources-store.js";

export type ApplyOperationRiskResult = {
  readonly operations: Operation[];
  readonly overrideCount: number;
};

export class OperationRiskService extends Context.Service<
  OperationRiskService,
  {
    readonly loadConfig: () => Effect.Effect<OperationRiskConfigFile, Error>;
    readonly applyToOperations: (
      operations: readonly Operation[],
      options?: {
        readonly extraTrustedMcpSources?: readonly string[];
        readonly home?: string;
        /** When false, skip WORM append for overrides (tests). Default true. */
        readonly wormLogOverrides?: boolean;
      }
    ) => Effect.Effect<ApplyOperationRiskResult, Error>;
  }
>()("clawql/OperationRiskService") {}

function mergeTrustedIds(
  file: OperationRiskConfigFile,
  envIds: readonly string[],
  extra: readonly string[] | undefined
): Set<string> {
  const set = new Set<string>();
  for (const id of file.trustedMcpSources ?? []) set.add(id);
  for (const id of envIds) set.add(id);
  for (const id of extra ?? []) set.add(id);
  return set;
}

export const OperationRiskLive = Layer.succeed(
  OperationRiskService,
  OperationRiskService.of({
    loadConfig: () => readOperationRiskConfigEffect(),
    applyToOperations: (operations, options) =>
      Effect.gen(function* () {
        const home = options?.home ?? resolveClawqlHome();
        const file = yield* readOperationRiskConfigEffect(home);
        const envIds = yield* trustedMcpSourcesFromEnvEffect();
        const trusted = mergeTrustedIds(file, envIds, options?.extraTrustedMcpSources);
        const overrides = file.overrides ?? {};
        const wormLog = options?.wormLogOverrides !== false;

        const out: Operation[] = [];
        let overrideCount = 0;

        for (const op of operations) {
          // sources.json `trusted` on MCP entries is passed via riskHints + extraTrusted
          const base = yield* classifyOperationRiskEffect({
            operation: op,
            trustedMcpSourceIds: trusted,
          });

          const ov = overrides[op.id];
          let risk: OperationRisk = base;
          if (ov) {
            overrideCount += 1;
            risk = {
              policy: ov.policy,
              level: ov.level ?? levelForPolicy(ov.policy),
              source: "override",
              reason: ov.reason,
            };
            if (wormLog) {
              yield* appendProcessWormEffect({
                type: "OPERATION_RISK_OVERRIDE",
                timestamp: new Date().toISOString(),
                sessionId: process.env.CLAWQL_SESSION_ID?.trim() || "operation-risk",
                metadata: {
                  operationId: op.id,
                  policy: risk.policy,
                  level: risk.level,
                  reason: risk.reason,
                  previousPolicy: base.policy,
                  previousLevel: base.level,
                  previousSource: base.source,
                },
              });
            }
          }

          out.push({ ...op, risk });
        }

        return { operations: out, overrideCount };
      }),
  })
);

/** Host-boundary helper for loadSpec merge path. */
export async function applyOperationRiskToLoadedOps(
  operations: readonly Operation[],
  options?: {
    readonly extraTrustedMcpSources?: readonly string[];
    readonly home?: string;
    readonly wormLogOverrides?: boolean;
  }
): Promise<Operation[]> {
  const program = Effect.gen(function* () {
    const svc = yield* OperationRiskService;
    const result = yield* svc.applyToOperations(operations, options);
    return result.operations;
  }).pipe(Effect.provide(OperationRiskLive));

  return Effect.runPromise(program);
}
