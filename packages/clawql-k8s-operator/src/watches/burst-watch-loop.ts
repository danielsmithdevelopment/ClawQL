/**
 * Continuous drain loop: BurstWatchStub → BurstOperatorService.
 * Stub informer substitute until a real K8s client is wired.
 */

import { Context, Effect, Layer } from "effect";
import {
  BurstOperatorService,
  BurstOperatorServiceLive,
} from "../effect/burst-operator-service.js";
import type { PolicyAllowSet } from "../drift.js";
import type { PlacementRequest } from "../session-placement.js";
import {
  BurstWatchStub,
  BurstWatchStubLive,
  type WatchDispatchResult,
  type WatchEvent,
} from "./burst-watch-stub.js";

export type WatchLoopTickResult = WatchDispatchResult & {
  readonly tick: number;
};

export class BurstWatchLoop extends Context.Tag("clawql/BurstWatchLoop")<
  BurstWatchLoop,
  {
    readonly enqueue: (event: WatchEvent) => Effect.Effect<void>;
    readonly tick: (args?: {
      readonly atrAllows?: PolicyAllowSet;
      readonly meshAllows?: PolicyAllowSet;
      readonly placement?: PlacementRequest;
    }) => Effect.Effect<WatchLoopTickResult>;
    /** Drain up to `maxTicks` times or until a tick processes 0 events. */
    readonly runUntilIdle: (args?: {
      readonly maxTicks?: number;
      readonly atrAllows?: PolicyAllowSet;
      readonly meshAllows?: PolicyAllowSet;
      readonly placement?: PlacementRequest;
    }) => Effect.Effect<readonly WatchLoopTickResult[]>;
  }
>() {}

export const BurstWatchLoopLive: Layer.Layer<
  BurstWatchLoop,
  never,
  BurstWatchStub | BurstOperatorService
> = Layer.effect(
  BurstWatchLoop,
  Effect.gen(function* () {
    const watches = yield* BurstWatchStub;
    const operator = yield* BurstOperatorService;
    let tickCount = 0;

    const oneTick = (args?: {
      readonly atrAllows?: PolicyAllowSet;
      readonly meshAllows?: PolicyAllowSet;
      readonly placement?: PlacementRequest;
    }) =>
      Effect.gen(function* () {
        tickCount += 1;
        const drained = yield* watches.drain(args);
        if (args?.atrAllows && args?.meshAllows) {
          yield* operator.detectDrift(args.meshAllows, args.atrAllows);
        }
        for (const denial of drained.meshBridges) {
          yield* operator.bridgeMeshDenial(denial.metadata);
        }
        return { ...drained, tick: tickCount };
      });

    return {
      enqueue: (event) => watches.enqueue(event),
      tick: oneTick,
      runUntilIdle: (args) =>
        Effect.gen(function* () {
          const maxTicks = args?.maxTicks ?? 8;
          const out: WatchLoopTickResult[] = [];
          for (let i = 0; i < maxTicks; i++) {
            const t = yield* oneTick(args);
            out.push(t);
            if (t.processed === 0) break;
          }
          return out;
        }),
    };
  })
);

/** Stack: stub watches + operator + loop. */
export const BurstWatchControllerLive: Layer.Layer<
  BurstWatchLoop | BurstWatchStub | BurstOperatorService
> = BurstWatchLoopLive.pipe(
  Layer.provideMerge(BurstWatchStubLive),
  Layer.provideMerge(BurstOperatorServiceLive)
);
