/**
 * Kubernetes Watch-based pod informer → BurstWatchStub events.
 * Uses @kubernetes/client-node when kubeconfig is available; otherwise
 * `tryCreatePodInformer` returns null and callers stay on the stub queue.
 */

import { randomUUID } from "node:crypto";
import { Context, Effect, Layer } from "effect";
import type { BurstWatchStub } from "./burst-watch-stub.js";
import type { CelldNodeLoad } from "../session-placement.js";

export type PodInformerOptions = {
  readonly namespace?: string;
  readonly labelSelector?: string;
  /** Called for each mapped watch event (tests inject BurstWatchStub.enqueue). */
  readonly onEvent: (event: import("./burst-watch-stub.js").WatchEvent) => Effect.Effect<void>;
};

export type PodInformerHandle = {
  readonly stop: () => void;
  readonly source: "kubernetes-watch";
};

export class PodInformerService extends Context.Tag("clawql/PodInformerService")<
  PodInformerService,
  {
    /** Start watching pods; fails with reason when kubeconfig / cluster unavailable. */
    readonly start: (
      options: PodInformerOptions
    ) => Effect.Effect<
      PodInformerHandle,
      { readonly _tag: "PodInformerUnavailable"; readonly reason: string }
    >;
  }
>() {}

function nodeLoadsFromPods(
  pods: ReadonlyArray<{
    readonly spec?: { readonly nodeName?: string };
    readonly status?: { readonly phase?: string };
  }>
): readonly CelldNodeLoad[] {
  const byNode = new Map<string, { running: number }>();
  for (const p of pods) {
    const node = p.spec?.nodeName;
    if (!node) continue;
    if ((p.status?.phase ?? "") !== "Running") continue;
    const cur = byNode.get(node) ?? { running: 0 };
    cur.running += 1;
    byNode.set(node, cur);
  }
  return [...byNode.entries()].map(([nodeId, v]) => ({
    nodeId,
    runningCellCount: v.running,
    memoryUtil: Math.min(1, v.running / 50),
  }));
}

/**
 * Live implementation — dynamic-imports @kubernetes/client-node so unit tests
 * without the dep graph still load the package (dep is declared).
 */
export function makeKubernetesPodInformer(): Context.Tag.Service<typeof PodInformerService> {
  return {
    start: (options) =>
      Effect.tryPromise({
        try: async () => {
          const k8s = await import("@kubernetes/client-node");
          const kc = new k8s.KubeConfig();
          try {
            kc.loadFromCluster();
          } catch {
            kc.loadFromDefault();
          }
          const watch = new k8s.Watch(kc);
          const ns = options.namespace ?? "default";
          const path = `/api/v1/namespaces/${ns}/pods`;
          const query: Record<string, string> = {};
          if (options.labelSelector) query.labelSelector = options.labelSelector;

          const pods = new Map<
            string,
            {
              spec?: { nodeName?: string };
              status?: { phase?: string };
              metadata?: { name?: string };
            }
          >();
          let closed = false;

          const req = await watch.watch(
            path,
            query,
            (phase: string, obj: unknown) => {
              if (closed) return;
              const pod = obj as {
                metadata?: { name?: string; uid?: string };
                spec?: { nodeName?: string };
                status?: { phase?: string; reason?: string };
              };
              const key = pod.metadata?.uid ?? pod.metadata?.name ?? `anon-${randomUUID()}`;
              if (phase === "DELETED") {
                pods.delete(key);
                const name = pod.metadata?.name ?? key;
                void Effect.runPromise(
                  options.onEvent({
                    kind: "pod_eviction_request",
                    sessionId: `pod:${name}`,
                    reason: pod.status?.reason ?? "deleted",
                  })
                );
              } else {
                pods.set(key, pod);
              }
              const nodes = nodeLoadsFromPods([...pods.values()]);
              void Effect.runPromise(options.onEvent({ kind: "node_load", nodes }));
            },
            (err) => {
              closed = true;
              if (err) {
                // Watch ended — surface via stop only; callers may restart.
              }
            }
          );

          return {
            source: "kubernetes-watch" as const,
            stop: () => {
              closed = true;
              try {
                (req as { abort?: () => void }).abort?.();
              } catch {
                /* ignore */
              }
            },
          };
        },
        catch: (e) => ({
          _tag: "PodInformerUnavailable" as const,
          reason: e instanceof Error ? e.message : String(e),
        }),
      }),
  };
}

export const KubernetesPodInformerLive: Layer.Layer<PodInformerService> = Layer.succeed(
  PodInformerService,
  makeKubernetesPodInformer()
);

/** Test double: never connects; always unavailable. */
export const UnavailablePodInformerLive: Layer.Layer<PodInformerService> = Layer.succeed(
  PodInformerService,
  {
    start: () =>
      Effect.fail({
        _tag: "PodInformerUnavailable" as const,
        reason: "test double — no cluster",
      }),
  }
);

/**
 * Start informer if possible; on failure enqueue nothing and return null.
 * Wired for BurstWatchStub via onEvent → enqueue.
 */
export function startPodInformerOrNull(
  informer: Context.Tag.Service<typeof PodInformerService>,
  stub: Context.Tag.Service<typeof BurstWatchStub>,
  options?: Omit<PodInformerOptions, "onEvent">
): Effect.Effect<PodInformerHandle | null> {
  return informer
    .start({
      ...options,
      onEvent: (event) => stub.enqueue(event),
    })
    .pipe(Effect.catchAll(() => Effect.succeed(null)));
}
