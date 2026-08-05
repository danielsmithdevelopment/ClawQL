import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Context, Data, Effect, Layer } from "effect";
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
    peer_transfer: "2510",
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
    "2510": "Peer credit transfers (clearing)",
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

/** @deprecated Prefer AccountingMapService.load — Promise façade retained for legacy callers. */
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

export class AccountingMapError extends Data.TaggedError("AccountingMapError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/** Effect surface over the chart-of-accounts / GL mapping (accounting-map.json overrides). */
export class AccountingMapService extends Context.Tag("clawql/AccountingMapService")<
  AccountingMapService,
  {
    readonly load: () => Effect.Effect<AccountingMapFile, AccountingMapError>;
    readonly resolveGlCode: (
      category: AccountingCategory
    ) => Effect.Effect<string, AccountingMapError>;
  }
>() {}

export function accountingMapLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<AccountingMapService> {
  const run = <A>(reason: string, task: () => Promise<A>) =>
    Effect.tryPromise({
      try: task,
      catch: (cause) =>
        cause instanceof AccountingMapError
          ? cause
          : new AccountingMapError({
              reason: cause instanceof Error ? cause.message : reason,
              cause,
            }),
    });

  return Layer.succeed(
    AccountingMapService,
    AccountingMapService.of({
      load: () => run("Failed to load accounting map", () => loadAccountingMap(env)),
      resolveGlCode: (category) =>
        run("Failed to resolve GL code", () => loadAccountingMap(env)).pipe(
          Effect.map((map) => resolveGlCode(category, map))
        ),
    })
  );
}
