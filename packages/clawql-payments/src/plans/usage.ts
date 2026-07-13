import { Effect } from "effect";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import { UsageStoreService } from "./usage-store-service.js";
import type { MonthlyUsage, UsageMetric, UsageStore } from "./usage-types.js";

export type { MonthlyUsage, UsageMetric, UsageStore };

export function createUsageStore(env: NodeJS.ProcessEnv = process.env): UsageStore {
  return {
    getUsage: (tenantId, month) =>
      runPaymentsEffect(
        Effect.gen(function* () {
          const usage = yield* UsageStoreService;
          return yield* usage.getUsage(tenantId, month);
        }),
        env
      ),
    increment: (tenantId, metric, amount, planId) =>
      runPaymentsEffect(
        Effect.gen(function* () {
          const usage = yield* UsageStoreService;
          return yield* usage.increment(tenantId, metric, amount, planId);
        }),
        env
      ),
  };
}

import type { ClawqlPlanId } from "./tiers.js";