/**
 * Compose live / optional BurstWatch sources onto BurstWatchStub.
 *
 * Starts PodInformer + NodeClaimInformer when kubeconfig works; optionally
 * tails an Istio access-log path when present. Each source that cannot start
 * is recorded as unavailable — never invents watch events.
 *
 * Spec: docs/streams/aws-celld-burst.md §8.
 */

import { Context, Effect, Layer } from "effect";
import type { BurstWatchStub } from "./burst-watch-stub.js";
import {
  PodInformerService,
  startPodInformerOrNull,
  type PodInformerHandle,
} from "./pod-informer.js";
import {
  NodeClaimInformerService,
  startNodeClaimInformerOrNull,
  type NodeClaimInformerHandle,
} from "./karpenter-nodeclaim-informer.js";
import {
  IstioAccessLogTailService,
  startIstioAccessLogTailOrNull,
  type IstioAccessLogTailHandle,
} from "./istio-access-log-tail.js";

export type BurstWatchSourcesOptions = {
  readonly podNamespace?: string;
  readonly podLabelSelector?: string;
  readonly nodeClaimLabelSelector?: string;
  readonly enablePodInformer?: boolean;
  readonly enableNodeClaimInformer?: boolean;
  /**
   * When set, start IstioAccessLogTailService against this NDJSON path.
   * Missing/unreadable path → status started:false (fail-closed).
   */
  readonly istioAccessLogPath?: string;
};

export type BurstWatchSourceStatus = {
  readonly id: "pod-informer" | "nodeclaim-informer" | "istio-access-log-tail";
  readonly started: boolean;
  readonly detail: string;
};

export type BurstWatchSourcesHandle = {
  readonly stop: () => void;
  readonly statuses: readonly BurstWatchSourceStatus[];
  readonly startedCount: number;
};

export class BurstWatchSourcesService extends Context.Tag("clawql/BurstWatchSourcesService")<
  BurstWatchSourcesService,
  {
    readonly start: (
      stub: Context.Tag.Service<typeof BurstWatchStub>,
      options?: BurstWatchSourcesOptions
    ) => Effect.Effect<BurstWatchSourcesHandle>;
  }
>() {}

export function makeBurstWatchSourcesService(
  pod: Context.Tag.Service<typeof PodInformerService>,
  nodeClaim: Context.Tag.Service<typeof NodeClaimInformerService>,
  istioTail?: Context.Tag.Service<typeof IstioAccessLogTailService>
): Context.Tag.Service<typeof BurstWatchSourcesService> {
  return {
    start: (stub, options) =>
      Effect.gen(function* () {
        const statuses: BurstWatchSourceStatus[] = [];
        const stops: Array<() => void> = [];
        const enablePod = options?.enablePodInformer !== false;
        const enableNc = options?.enableNodeClaimInformer !== false;

        if (enablePod) {
          const handle: PodInformerHandle | null = yield* startPodInformerOrNull(pod, stub, {
            namespace: options?.podNamespace,
            labelSelector: options?.podLabelSelector,
          });
          if (handle) {
            stops.push(handle.stop);
            statuses.push({
              id: "pod-informer",
              started: true,
              detail: `kubernetes-watch ns=${options?.podNamespace ?? "default"}`,
            });
          } else {
            statuses.push({
              id: "pod-informer",
              started: false,
              detail: "unavailable (no kubeconfig / cluster)",
            });
          }
        }

        if (enableNc) {
          const handle: NodeClaimInformerHandle | null = yield* startNodeClaimInformerOrNull(
            nodeClaim,
            stub,
            { labelSelector: options?.nodeClaimLabelSelector }
          );
          if (handle) {
            stops.push(handle.stop);
            statuses.push({
              id: "nodeclaim-informer",
              started: true,
              detail: "kubernetes-watch nodeclaims.karpenter.sh",
            });
          } else {
            statuses.push({
              id: "nodeclaim-informer",
              started: false,
              detail: "unavailable (no kubeconfig / cluster)",
            });
          }
        }

        if (options?.istioAccessLogPath) {
          if (!istioTail) {
            statuses.push({
              id: "istio-access-log-tail",
              started: false,
              detail: "IstioAccessLogTailService not provided to bootstrap",
            });
          } else {
            const handle: IstioAccessLogTailHandle | null = yield* startIstioAccessLogTailOrNull(
              istioTail,
              stub,
              { path: options.istioAccessLogPath, fromStart: true }
            );
            if (handle) {
              stops.push(handle.stop);
              statuses.push({
                id: "istio-access-log-tail",
                started: true,
                detail: `file-tail ${options.istioAccessLogPath}`,
              });
            } else {
              statuses.push({
                id: "istio-access-log-tail",
                started: false,
                detail: `unavailable (${options.istioAccessLogPath})`,
              });
            }
          }
        }

        const startedCount = statuses.filter((s) => s.started).length;
        return {
          startedCount,
          statuses,
          stop: () => {
            for (const s of stops) {
              try {
                s();
              } catch {
                /* ignore */
              }
            }
          },
        } satisfies BurstWatchSourcesHandle;
      }),
  };
}

export const BurstWatchSourcesLive: Layer.Layer<
  BurstWatchSourcesService,
  never,
  PodInformerService | NodeClaimInformerService | IstioAccessLogTailService
> = Layer.effect(
  BurstWatchSourcesService,
  Effect.gen(function* () {
    const pod = yield* PodInformerService;
    const nc = yield* NodeClaimInformerService;
    const istio = yield* IstioAccessLogTailService;
    return makeBurstWatchSourcesService(pod, nc, istio);
  })
);

/** Test / no-cluster stack: unavailable informers + sources service. */
export const BurstWatchSourcesUnavailableLive: Layer.Layer<
  | BurstWatchSourcesService
  | PodInformerService
  | NodeClaimInformerService
  | IstioAccessLogTailService
> = BurstWatchSourcesLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      Layer.succeed(PodInformerService, {
        start: () =>
          Effect.fail({
            _tag: "PodInformerUnavailable" as const,
            reason: "test double — no cluster",
          }),
      }),
      Layer.succeed(NodeClaimInformerService, {
        start: () =>
          Effect.fail({
            _tag: "NodeClaimInformerUnavailable" as const,
            reason: "test double — no cluster",
          }),
      }),
      Layer.succeed(IstioAccessLogTailService, {
        start: () =>
          Effect.fail({
            _tag: "IstioAccessLogTailUnavailable" as const,
            reason: "test double — no access-log path",
          }),
        ingestFileOnce: () =>
          Effect.fail({
            _tag: "IstioAccessLogTailUnavailable" as const,
            reason: "test double — no access-log path",
          }),
      })
    )
  )
);
