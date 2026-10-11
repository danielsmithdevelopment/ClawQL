/**
 * Fan-out costEstimate from virtual-key / inference spend ledger (v0.1).
 * Uses the same rough USD rates as keys/budget.ts until provider pricing lands.
 */

import { Context, Effect, Layer } from "effect";
import type { SpendRow } from "../store/types.js";

/** Match keys/budget estimateCostUsd rates. */
export const SPEND_INPUT_USD_PER_TOKEN = 0.000_001;
export const SPEND_OUTPUT_USD_PER_TOKEN = 0.000_003;

export type FanoutCostSource = "explicit" | "spend_ledger";

/** Minimal backend ref for cost lookup (avoids cycle with fanout-eval). */
export type SpendCostBackendRef = {
  readonly id: string;
  readonly model?: string;
  readonly costPerCase?: number;
};

export function usdFromTokenCounts(
  inputTokens: number,
  outputTokens: number
): Effect.Effect<number> {
  return Effect.sync(
    () => inputTokens * SPEND_INPUT_USD_PER_TOKEN + outputTokens * SPEND_OUTPUT_USD_PER_TOKEN
  );
}

/** Average USD per call for a spend rollup row. */
export function costPerCallFromSpendRow(row: SpendRow): Effect.Effect<number> {
  return Effect.gen(function* () {
    if (row.calls <= 0) return 0;
    const usd = yield* usdFromTokenCounts(row.inputTokens, row.outputTokens);
    return usd / row.calls;
  });
}

export function buildSpendCostLookup(
  rows: readonly SpendRow[]
): Effect.Effect<ReadonlyMap<string, number>> {
  return Effect.gen(function* () {
    const map = new Map<string, number>();
    for (const row of rows) {
      const cost = yield* costPerCallFromSpendRow(row);
      const key = row.key.trim().toLowerCase();
      if (!key) continue;
      map.set(key, cost);
      // Also index last path segment (gpt-6-luna from openai/gpt-6-luna).
      const slash = key.lastIndexOf("/");
      if (slash >= 0 && slash < key.length - 1) {
        const leaf = key.slice(slash + 1);
        if (!map.has(leaf)) map.set(leaf, cost);
      }
    }
    return map;
  });
}

export function lookupSpendCostPerCase(
  backend: SpendCostBackendRef,
  lookup: ReadonlyMap<string, number>
): Effect.Effect<number | undefined> {
  return Effect.sync(() => {
    if (typeof backend.costPerCase === "number") return backend.costPerCase;
    const candidates = [backend.model, backend.id]
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .map((s) => s.trim().toLowerCase());
    for (const c of candidates) {
      if (lookup.has(c)) return lookup.get(c);
      const slash = c.lastIndexOf("/");
      if (slash >= 0) {
        const leaf = c.slice(slash + 1);
        if (lookup.has(leaf)) return lookup.get(leaf);
      }
    }
    return undefined;
  });
}

export function parseSpendCostsRecord(
  raw: unknown
): Effect.Effect<ReadonlyMap<string, number> | { error: string }> {
  return Effect.sync(() => {
    if (raw === undefined || raw === null) return new Map<string, number>();
    if (typeof raw !== "object" || Array.isArray(raw)) {
      return { error: "spendCosts must be an object of model→costPerCase" };
    }
    const map = new Map<string, number>();
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const key = k.trim().toLowerCase();
      if (!key || typeof v !== "number" || !Number.isFinite(v) || v < 0) {
        return { error: `spendCosts['${k}'] must be a non-negative number` };
      }
      map.set(key, v);
    }
    return map;
  });
}

export class FanoutSpendCostService extends Context.Service<
  FanoutSpendCostService,
  {
    readonly lookup: (
      backend: SpendCostBackendRef,
      spendCosts?: ReadonlyMap<string, number>
    ) => Effect.Effect<number | undefined>;
    readonly fromSpendRows: (
      rows: readonly SpendRow[]
    ) => Effect.Effect<ReadonlyMap<string, number>>;
  }
>()("clawql/inference/FanoutSpendCostService") {}

export const FanoutSpendCostLive: Layer.Layer<FanoutSpendCostService> = Layer.succeed(
  FanoutSpendCostService,
  {
    lookup: (backend, spendCosts) =>
      spendCosts
        ? lookupSpendCostPerCase(backend, spendCosts)
        : Effect.succeed(typeof backend.costPerCase === "number" ? backend.costPerCase : undefined),
    fromSpendRows: buildSpendCostLookup,
  }
);
