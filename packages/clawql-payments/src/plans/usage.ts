import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveUsagePath } from "../config/paths.js";
import type { ClawqlPlanId } from "./tiers.js";

export type UsageMetric = "inference_calls" | "documents" | "memory_mb";

export type MonthlyUsage = {
  month: string;
  tenantId: string;
  planId: ClawqlPlanId;
  inferenceCalls: number;
  documents: number;
  memoryMbPeak: number;
};

export type UsageStore = {
  readonly getUsage: (tenantId: string, month?: string) => Promise<MonthlyUsage>;
  readonly increment: (
    tenantId: string,
    metric: UsageMetric,
    amount?: number,
    planId?: ClawqlPlanId
  ) => Promise<MonthlyUsage>;
};

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

async function loadUsageFile(env: NodeJS.ProcessEnv): Promise<UsageFile> {
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
}

async function saveUsageFile(file: UsageFile, env: NodeJS.ProcessEnv): Promise<void> {
  const path = resolveUsagePath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
}

export function createUsageStore(env: NodeJS.ProcessEnv = process.env): UsageStore {
  return {
    async getUsage(tenantId, month = currentMonth()): Promise<MonthlyUsage> {
      const file = await loadUsageFile(env);
      const existing = file.records.find(
        (r) => r.tenantId === tenantId && r.month === month
      );
      return (
        existing ?? {
          month,
          tenantId,
          planId: "free",
          inferenceCalls: 0,
          documents: 0,
          memoryMbPeak: 0,
        }
      );
    },

    async increment(tenantId, metric, amount = 1, planId = "free"): Promise<MonthlyUsage> {
      const month = currentMonth();
      const file = await loadUsageFile(env);
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
      switch (metric) {
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
      await saveUsageFile(file, env);
      return record;
    },
  };
}
