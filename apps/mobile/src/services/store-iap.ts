/**
 * PhoneApprove store subscription adapter — fixture sandbox today;
 * StoreKit / Play sheet swaps in behind the same Effect API after Day-0.
 */
import { Context, Data, Effect, Layer, Schema } from "effect";
import { Linking, Platform } from "react-native";

import {
  loadEntitlementsEffect,
  restorePurchasesEffect,
  subscribeStoreSandboxEffect,
  type MobileEntitlements,
  type MobilePlanId,
} from "./entitlements";
import { loadMobileConfigEffect } from "./config";

export const StoreProductId = Schema.Literals([
  "clawql_pro_monthly",
  "clawql_pro_annual",
  "clawql_team_monthly",
  "clawql_team_annual",
]);
export type StoreProductId = Schema.Schema.Type<typeof StoreProductId>;

export type StoreCatalogEntry = {
  readonly productId: StoreProductId;
  readonly planId: "pro" | "team";
  readonly period: "monthly" | "annual";
  readonly label: string;
};

export const STORE_CATALOG: readonly StoreCatalogEntry[] = [
  {
    productId: "clawql_pro_monthly",
    planId: "pro",
    period: "monthly",
    label: "Pro monthly",
  },
  {
    productId: "clawql_pro_annual",
    planId: "pro",
    period: "annual",
    label: "Pro annual",
  },
  {
    productId: "clawql_team_monthly",
    planId: "team",
    period: "monthly",
    label: "Team monthly",
  },
  {
    productId: "clawql_team_annual",
    planId: "team",
    period: "annual",
    label: "Team annual",
  },
] as const;

const PLAN_RANK: Record<MobilePlanId, number> = {
  free: 0,
  pro: 1,
  team: 2,
  enterprise: 3,
};

export class StoreIapError extends Data.TaggedError("StoreIapError")<{
  readonly reason: string;
}> {}

export function productForPlanEffect(
  planId: "pro" | "team",
  period: "monthly" | "annual" = "monthly"
): Effect.Effect<StoreCatalogEntry, StoreIapError> {
  return Effect.gen(function* () {
    const hit = STORE_CATALOG.find((p) => p.planId === planId && p.period === period);
    if (!hit) {
      return yield* Effect.fail(
        new StoreIapError({ reason: `No store product for ${planId}/${period}` })
      );
    }
    return hit;
  });
}

/** Purchase (fixture sandbox or future StoreKit / Play sheet). */
export function purchaseStorePlanEffect(
  planId: "pro" | "team"
): Effect.Effect<MobileEntitlements, StoreIapError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (!config.fixtureMode) {
      return yield* Effect.fail(
        new StoreIapError({
          reason: "store_iap_not_configured — use fixture mode or complete Day-0 store enrollment",
        })
      );
    }
    return yield* subscribeStoreSandboxEffect(planId).pipe(
      Effect.mapError((e) => new StoreIapError({ reason: e.reason }))
    );
  });
}

export function restoreStorePurchasesEffect(): Effect.Effect<
  MobileEntitlements,
  StoreIapError
> {
  return restorePurchasesEffect().pipe(
    Effect.mapError((e) => new StoreIapError({ reason: e.reason }))
  );
}

/** Deep link to Apple / Google subscription management (or docs in fixture). */
export function manageSubscriptionsUrlEffect(): Effect.Effect<string> {
  return Effect.sync(() => {
    if (Platform.OS === "ios") {
      return "https://apps.apple.com/account/subscriptions";
    }
    if (Platform.OS === "android") {
      return "https://play.google.com/store/account/subscriptions";
    }
    return "https://docs.clawql.com/billing";
  });
}

export function openManageSubscriptionsEffect(): Effect.Effect<void, StoreIapError> {
  return Effect.gen(function* () {
    const url = yield* manageSubscriptionsUrlEffect();
    yield* Effect.tryPromise({
      try: () => Linking.openURL(url),
      catch: (cause) =>
        new StoreIapError({
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    });
  });
}

export function planMeetsMinimumEffect(
  minimum: MobilePlanId
): Effect.Effect<boolean, StoreIapError> {
  return Effect.gen(function* () {
    const ent = yield* loadEntitlementsEffect().pipe(
      Effect.mapError((e) => new StoreIapError({ reason: e.reason }))
    );
    return PLAN_RANK[ent.planId] >= PLAN_RANK[minimum];
  });
}

const CLAWQL_STORE_IAP_TAG = "clawql/MobileStoreIap" as const;

export class MobileStoreIapService extends Context.Service<
  typeof CLAWQL_STORE_IAP_TAG,
  {
    readonly purchase: (
      planId: "pro" | "team"
    ) => Effect.Effect<MobileEntitlements, StoreIapError>;
    readonly restore: () => Effect.Effect<MobileEntitlements, StoreIapError>;
    readonly manageUrl: () => Effect.Effect<string>;
    readonly openManage: () => Effect.Effect<void, StoreIapError>;
    readonly planMeets: (minimum: MobilePlanId) => Effect.Effect<boolean, StoreIapError>;
  }
>()(CLAWQL_STORE_IAP_TAG) {}

export const MobileStoreIapLive = Layer.succeed(MobileStoreIapService, {
  purchase: purchaseStorePlanEffect,
  restore: restoreStorePurchasesEffect,
  manageUrl: manageSubscriptionsUrlEffect,
  openManage: openManageSubscriptionsEffect,
  planMeets: planMeetsMinimumEffect,
});
