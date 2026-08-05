import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolvePaymentsDir } from "../config/paths.js";
import type { AccountingCategory, AccountingMapFile } from "./types.js";

/** Default GL template — customers override via accounting-map.json. */
export const DEFAULT_ACCOUNTING_MAP: Required<Pick<AccountingMapFile, "categories">> & {
  labels: Record<string, string>;
} = {
  categories: {
    saas_revenue: "4000",
    usage_revenue: "4100",
    micropayment_revenue: "4100",
    prepaid_liability: "2500",
    prepaid_redemption: "4100",
    creator_payout: "6000",
    agent_compensation: "6100",
    agent_spend: "6200",
    fx_or_network_fee: "6300",
    other: "6999",
  },
  labels: {
    "4000": "Subscription revenue",
    "4100": "Usage / agent API revenue",
    "2500": "Customer credits liability",
    "6000": "Creator COGS / payouts",
    "6100": "Agent compensation expense",
    "6200": "Agent procurement / Ramp",
    "6300": "Payment processing fees",
    "6999": "Other payment activity",
  },
};

export function resolveAccountingMapPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "accounting-map.json");
}

export async function loadAccountingMap(
  env: NodeJS.ProcessEnv = process.env
): Promise<AccountingMapFile> {
  const path = resolveAccountingMapPath(env);
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as AccountingMapFile;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

export function resolveGlCode(category: AccountingCategory, map: AccountingMapFile = {}): string {
  return map.categories?.[category] ?? DEFAULT_ACCOUNTING_MAP.categories[category] ?? "6999";
}

export function mergeAccountingMap(overrides: AccountingMapFile = {}): AccountingMapFile {
  return {
    categories: { ...DEFAULT_ACCOUNTING_MAP.categories, ...overrides.categories },
    labels: { ...DEFAULT_ACCOUNTING_MAP.labels, ...overrides.labels },
  };
}
