import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Context, Effect, Layer } from "effect";
import { resolveUsagePath } from "../config/paths.js";
import { PaymentError } from "../errors/payment-errors.js";
import type { ClawqlPlanId } from "../plans/tiers.js";
import type { MonthlyUsage, UsageMetric } from "../plans/usage-types.js";

type UsageFile = {
  records: MonthlyUsage[];
};

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function usageKey(tenantId: string, month: string): string {
  return `${tenantId}:${month}`;
}

function loadUsageFileEffect(env: NodeJS.ProcessEnv): Effect.Effect<UsageFile, PaymentError> {
  return Effect.tryPromise({
    try: async () => {
      const path = resolveUsagePath(env);
      try {
        const raw = await readFile(path, "utf8");
        return JSON.parse(raw) as UsageFile;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          return { records: [] };
        }
        throw err;
      }
    },
    catch: (cause) =>
      new PaymentError({
        reason: "failed to load usage file",
        cause,
      }),
  });
}

function saveUsageFileEffect(
  file: UsageFile,
  env: NodeJS.ProcessEnv
): Effect.Effect<void, PaymentError> {
  return Effect.tryPromise({
    try: async () => {
      const path = resolveUsagePath(env);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    },
    catch: (cause) =>
      new PaymentError({
        reason: "failed to save usage file",
        cause,
      }),
  });
}

/** Effect service for monthly plan usage counters. */
export class UsageStoreService extends Context.Tag("clawql/UsageStoreService")<
  UsageStoreService,
  {
    readonly getUsage: (
      tenantId: string,
      month?: string
    ) => Effect.Effect<MonthlyUsage, PaymentError>;
    readonly increment: (
      tenantId: string,
      metric: UsageMetric,
      amount?: number,
      planId?: ClawqlPlanId
    ) => Effect.Effect<MonthlyUsage, PaymentError>;
  }
>() {}

export function usageStoreLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<UsageStoreService> {
  return Layer.succeed(
    UsageStoreService,
    UsageStoreService.of({
      getUsage: (tenantId, month = currentMonth()) =>
        Effect.gen(function* () {
          const file = yield* loadUsageFileEffect(env);
          const existing = file.records.find((r) => r.tenantId === tenantId && r.month === month);
          return (
            existing ?? {
              month,
              tenantId,
              planId: "free" as ClawqlPlanId,
              inferenceCalls: 0,
              documents: 0,
              memoryMbPeak: 0,
            }
          );
        }),
      increment: (tenantId, metric, amount = 1, planId = "free") =>
        Effect.gen(function* () {
          const month = currentMonth();
          const file = yield* loadUsageFileEffect(env);
          const key = usageKey(tenantId, month);
          let record = file.records.find((r) => usageKey(r.tenantId, r.month) === key);
          if (!record) {
            record = {
              month,
              tenantId,
              planId,
              inferenceCalls: 0,
              documents: 0,
              memoryMbPeak: 0,
            };
            file.records.push(record);
          }
          record.planId = planId;
          switch (metric as UsageMetric) {
            case "inference_calls":
              record.inferenceCalls += amount;
              break;
            case "documents":
              record.documents += amount;
              break;
            case "memory_mb":
              record.memoryMbPeak = Math.max(record.memoryMbPeak, amount);
              break;
          }
          yield* saveUsageFileEffect(file, env);
          return record;
        }),
    })
  );
}
