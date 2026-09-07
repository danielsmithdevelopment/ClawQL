/**
 * Day/session reserved+settled USDC counters — fail closed on error.
 */

import { Context, Effect, Layer, Ref } from "effect";
import {
  OutboundPolicyError,
  addUsdcDecimal,
  parseUsdcToAtomic,
} from "clawql-core";
import type { OutboundSpendCounters } from "./types.js";

export type SpendCounterKey = {
  readonly tenantId: string;
  readonly agentId: string;
  readonly sessionId: string;
  /** UTC day key YYYY-MM-DD */
  readonly dayKey: string;
};

function counterMapKey(k: SpendCounterKey): string {
  return `${k.tenantId}|${k.agentId}|${k.sessionId}|${k.dayKey}`;
}

export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

const zeroCounters = (): OutboundSpendCounters => ({
  dayReservedUsdc: "0",
  daySettledUsdc: "0",
  sessionReservedUsdc: "0",
  sessionSettledUsdc: "0",
});

const USDC_SCALE = 1_000_000n;

function subtractUsdc(
  from: string,
  amount: string
): Effect.Effect<string, OutboundPolicyError> {
  return Effect.gen(function* () {
    const a = yield* parseUsdcToAtomic(from);
    const b = yield* parseUsdcToAtomic(amount);
    if (b > a) {
      return yield* Effect.fail(
        new OutboundPolicyError({ reason: "counter_underflow_fail_closed" })
      );
    }
    const sum = a - b;
    const whole = sum / USDC_SCALE;
    const frac = (sum % USDC_SCALE).toString().padStart(6, "0").replace(/0+$/, "");
    return frac.length === 0 ? whole.toString() : `${whole}.${frac}`;
  });
}

export class OutboundSpendCounterService extends Context.Tag(
  "clawql/OutboundSpendCounterService"
)<
  OutboundSpendCounterService,
  {
    readonly get: (
      key: SpendCounterKey
    ) => Effect.Effect<OutboundSpendCounters, OutboundPolicyError>;
    readonly reserve: (
      key: SpendCounterKey,
      amountUsdc: string
    ) => Effect.Effect<OutboundSpendCounters, OutboundPolicyError>;
    readonly settleReserved: (
      key: SpendCounterKey,
      amountUsdc: string
    ) => Effect.Effect<OutboundSpendCounters, OutboundPolicyError>;
    readonly releaseReserved: (
      key: SpendCounterKey,
      amountUsdc: string
    ) => Effect.Effect<OutboundSpendCounters, OutboundPolicyError>;
    /** Day+session totals (reserved + settled) for policy projection. */
    readonly totals: (
      key: SpendCounterKey
    ) => Effect.Effect<{ dayTotalUsdc: string; sessionTotalUsdc: string }, OutboundPolicyError>;
  }
>() {}

export function createMemoryOutboundSpendCounterLayer(): Layer.Layer<OutboundSpendCounterService> {
  return Layer.effect(
    OutboundSpendCounterService,
    Effect.gen(function* () {
      const store = yield* Ref.make(new Map<string, OutboundSpendCounters>());

      const read = (key: SpendCounterKey) =>
        Effect.gen(function* () {
          const map = yield* Ref.get(store);
          return map.get(counterMapKey(key)) ?? zeroCounters();
        });

      const write = (key: SpendCounterKey, next: OutboundSpendCounters) =>
        Ref.update(store, (map) => {
          const copy = new Map(map);
          copy.set(counterMapKey(key), next);
          return copy;
        });

      return OutboundSpendCounterService.of({
        get: (key) => read(key),
        reserve: (key, amountUsdc) =>
          Effect.gen(function* () {
            const cur = yield* read(key);
            const next: OutboundSpendCounters = {
              ...cur,
              dayReservedUsdc: yield* addUsdcDecimal(cur.dayReservedUsdc, amountUsdc),
              sessionReservedUsdc: yield* addUsdcDecimal(cur.sessionReservedUsdc, amountUsdc),
            };
            yield* write(key, next);
            return next;
          }),
        settleReserved: (key, amountUsdc) =>
          Effect.gen(function* () {
            const cur = yield* read(key);
            const next: OutboundSpendCounters = {
              dayReservedUsdc: yield* subtractUsdc(cur.dayReservedUsdc, amountUsdc),
              sessionReservedUsdc: yield* subtractUsdc(cur.sessionReservedUsdc, amountUsdc),
              daySettledUsdc: yield* addUsdcDecimal(cur.daySettledUsdc, amountUsdc),
              sessionSettledUsdc: yield* addUsdcDecimal(cur.sessionSettledUsdc, amountUsdc),
            };
            yield* write(key, next);
            return next;
          }),
        releaseReserved: (key, amountUsdc) =>
          Effect.gen(function* () {
            const cur = yield* read(key);
            const next: OutboundSpendCounters = {
              ...cur,
              dayReservedUsdc: yield* subtractUsdc(cur.dayReservedUsdc, amountUsdc),
              sessionReservedUsdc: yield* subtractUsdc(cur.sessionReservedUsdc, amountUsdc),
            };
            yield* write(key, next);
            return next;
          }),
        totals: (key) =>
          Effect.gen(function* () {
            const cur = yield* read(key);
            return {
              dayTotalUsdc: yield* addUsdcDecimal(cur.dayReservedUsdc, cur.daySettledUsdc),
              sessionTotalUsdc: yield* addUsdcDecimal(
                cur.sessionReservedUsdc,
                cur.sessionSettledUsdc
              ),
            };
          }),
      });
    })
  );
}
