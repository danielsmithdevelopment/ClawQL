/**
 * Kubernetes Watch-based Karpenter NodeClaim informer → BurstWatchStub.
 *
 * Watches `nodeclaims.karpenter.sh` (cluster-scoped) when kubeconfig works;
 * otherwise `tryCreate` / `start…OrNull` stay unavailable (fail-closed — no
 * invented fleet events). Mapped via `mapKarpenterLifecycle`.
 *
 * Spec: docs/streams/aws-celld-burst.md §8 filler / headroom.
 */

import { randomUUID } from "node:crypto";
import { Context, Effect, Layer } from "effect";
import type { BurstWatchStub } from "./burst-watch-stub.js";
import {
  mapKarpenterLifecycle,
  type KarpenterLifecyclePhase,
  type KarpenterLifecycleRecord,
} from "./karpenter-lifecycle-adapter.js";

export type NodeClaimInformerOptions = {
  /** CRD group path; default karpenter.sh NodeClaims. */
  readonly apiPath?: string;
  readonly labelSelector?: string;
  readonly onEvent: (event: import("./burst-watch-stub.js").WatchEvent) => Effect.Effect<void>;
  /** Optional: receive mapped WORM labels for host audit trails. */
  readonly onMapped?: (rec: KarpenterLifecycleRecord, wormType: string) => Effect.Effect<void>;
};

export type NodeClaimInformerHandle = {
  readonly stop: () => void;
  readonly source: "kubernetes-watch-nodeclaim";
};

export class NodeClaimInformerService extends Context.Tag("clawql/NodeClaimInformerService")<
  NodeClaimInformerService,
  {
    readonly start: (
      options: NodeClaimInformerOptions
    ) => Effect.Effect<
      NodeClaimInformerHandle,
      { readonly _tag: "NodeClaimInformerUnavailable"; readonly reason: string }
    >;
  }
>() {}

/** Map a raw NodeClaim-shaped object to our lifecycle record. */
export function nodeClaimToLifecycleRecord(
  obj: unknown,
  watchPhase: string
): KarpenterLifecycleRecord {
  const nc = obj as {
    metadata?: { name?: string; uid?: string };
    status?: {
      conditions?: ReadonlyArray<{ type?: string; status?: string; reason?: string }>;
      nodeName?: string;
      providerID?: string;
    };
    spec?: { nodeClassRef?: { name?: string } };
  };
  const name = nc.metadata?.name ?? `anon-${randomUUID()}`;
  const nodeName = nc.status?.nodeName;
  const conditions = nc.status?.conditions ?? [];
  const ready = conditions.find((c) => (c.type ?? "").toLowerCase() === "ready");
  const disrupting = conditions.find((c) =>
    ["disrupting", "draining", "empty", "terminating"].includes((c.type ?? "").toLowerCase())
  );

  let phase: KarpenterLifecyclePhase = "unknown";
  if (watchPhase === "DELETED") {
    phase = "terminating";
  } else if (disrupting && String(disrupting.status).toLowerCase() === "true") {
    phase = "disrupting";
  } else if (ready && String(ready.status).toLowerCase() === "true") {
    phase = "ready";
  } else if (!ready || String(ready.status).toLowerCase() !== "true") {
    phase = "provisioning";
  }

  const reason =
    disrupting?.reason ?? ready?.reason ?? (watchPhase === "DELETED" ? "deleted" : phase);

  return {
    kind: "NodeClaim",
    name,
    phase,
    reason,
    nodeName,
    sessionId: `nodeclaim:${name}`,
  };
}

export function makeKubernetesNodeClaimInformer(): Context.Tag.Service<
  typeof NodeClaimInformerService
> {
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
          // Karpenter v1 NodeClaim — cluster-scoped
          const path = options.apiPath ?? "/apis/karpenter.sh/v1/nodeclaims";
          const query: Record<string, string> = {};
          if (options.labelSelector) query.labelSelector = options.labelSelector;

          let closed = false;
          const req = await watch.watch(
            path,
            query,
            (phase: string, obj: unknown) => {
              if (closed) return;
              const rec = nodeClaimToLifecycleRecord(obj, phase);
              void Effect.runPromise(
                Effect.gen(function* () {
                  const mapped = yield* mapKarpenterLifecycle(rec);
                  if (mapped.watchEvent) {
                    yield* options.onEvent(mapped.watchEvent);
                  }
                  if (options.onMapped) {
                    yield* options.onMapped(rec, mapped.wormType);
                  }
                })
              );
            },
            (_err) => {
              closed = true;
            }
          );

          return {
            source: "kubernetes-watch-nodeclaim" as const,
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
          _tag: "NodeClaimInformerUnavailable" as const,
          reason: e instanceof Error ? e.message : String(e),
        }),
      }),
  };
}

export const KubernetesNodeClaimInformerLive: Layer.Layer<NodeClaimInformerService> = Layer.succeed(
  NodeClaimInformerService,
  makeKubernetesNodeClaimInformer()
);

export const UnavailableNodeClaimInformerLive: Layer.Layer<NodeClaimInformerService> =
  Layer.succeed(NodeClaimInformerService, {
    start: () =>
      Effect.fail({
        _tag: "NodeClaimInformerUnavailable" as const,
        reason: "test double — no cluster",
      }),
  });

/**
 * Start NodeClaim informer if possible; on failure return null (no invented events).
 */
export function startNodeClaimInformerOrNull(
  informer: Context.Tag.Service<typeof NodeClaimInformerService>,
  stub: Context.Tag.Service<typeof BurstWatchStub>,
  options?: Omit<NodeClaimInformerOptions, "onEvent">
): Effect.Effect<NodeClaimInformerHandle | null> {
  return informer
    .start({
      ...options,
      onEvent: (event) => stub.enqueue(event),
    })
    .pipe(Effect.catchAll(() => Effect.succeed(null)));
}
