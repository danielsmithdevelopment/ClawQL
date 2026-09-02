import { Context, Data, Effect, Layer } from "effect";
import {
  reconcileClawqlInstance,
  type ClawQLInstanceObject,
  type ReconcileCoreV1,
  type ReconcileResult,
} from "../reconcile/reconcile-instance.js";
import {
  buildTierSpecConfigMapData,
  serializeTierSpecConfigMap,
  type TierSpecConfigMapData,
} from "../reconcile/tier-spec-configmap.js";
import type { ClawQLInstanceSpecV1Alpha1 } from "../spec/clawql-instance-v1alpha1.js";

export class OperatorReconcileError extends Data.TaggedError("OperatorReconcileError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class OperatorReconcileService extends Context.Tag("clawql/OperatorReconcileService")<
  OperatorReconcileService,
  {
    readonly reconcileInstance: (
      instance: ClawQLInstanceObject,
      core: ReconcileCoreV1
    ) => Effect.Effect<ReconcileResult, OperatorReconcileError>;
    readonly buildTierSpecConfigMap: (
      instanceName: string,
      namespace: string,
      spec: ClawQLInstanceSpecV1Alpha1,
      providerSecretName?: string
    ) => Effect.Effect<TierSpecConfigMapData, OperatorReconcileError>;
    readonly serializeTierSpecConfigMap: (
      data: TierSpecConfigMapData
    ) => Effect.Effect<Record<string, string>, OperatorReconcileError>;
  }
>() {}

const fromPromise = <A>(reason: string, task: () => Promise<A>) =>
  Effect.tryPromise({
    try: task,
    catch: (cause) => new OperatorReconcileError({ reason, cause }),
  });

export const OperatorReconcileServiceLive = Layer.succeed(
  OperatorReconcileService,
  OperatorReconcileService.of({
    reconcileInstance: (instance, core) =>
      fromPromise("reconcile ClawQLInstance failed", () =>
        reconcileClawqlInstance(instance, core)
      ),
    buildTierSpecConfigMap: (instanceName, namespace, spec, providerSecretName) =>
      Effect.sync(() =>
        buildTierSpecConfigMapData(instanceName, namespace, spec, providerSecretName)
      ),
    serializeTierSpecConfigMap: (data) =>
      Effect.sync(() => serializeTierSpecConfigMap(data)),
  })
);

export function runOperatorReconcileEffect<A, E>(
  program: Effect.Effect<A, E, OperatorReconcileService>
): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(OperatorReconcileServiceLive)));
}
