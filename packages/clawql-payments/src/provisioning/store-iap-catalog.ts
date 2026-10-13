/**
 * Shared App Store / Play product → plan map for PhoneApprove store_iap.
 * Keep in sync with `apps/mobile/store/iap-catalog.json`.
 */

import { Context, Effect, Layer } from "effect";
import type { ClawqlPlanId } from "../plans/tiers.js";

export type StoreIapPlatform = "app_store" | "play" | "fixture";

export type StoreIapProduct = {
  readonly productId: string;
  readonly planId: Exclude<ClawqlPlanId, "free" | "enterprise">;
  readonly period: "monthly" | "annual";
};

export const STORE_IAP_PRODUCTS: readonly StoreIapProduct[] = [
  { productId: "clawql_pro_monthly", planId: "pro", period: "monthly" },
  { productId: "clawql_pro_annual", planId: "pro", period: "annual" },
  { productId: "clawql_team_monthly", planId: "team", period: "monthly" },
  { productId: "clawql_team_annual", planId: "team", period: "annual" },
] as const;

const BY_ID = new Map(STORE_IAP_PRODUCTS.map((p) => [p.productId, p]));

export function lookupStoreIapProductEffect(
  productId: string
): Effect.Effect<StoreIapProduct | undefined> {
  return Effect.sync(() => BY_ID.get(productId.trim()) ?? undefined);
}

export function isFixtureStorePurchaseTokenEffect(token: string): Effect.Effect<boolean> {
  return Effect.sync(() => token.trim().startsWith("fixture_iap_"));
}

export function storeIapFixtureEnabledEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> {
  return Effect.sync(() => {
    const v = env.CLAWQL_STORE_IAP_FIXTURE?.trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
  });
}

const CLAWQL_STORE_IAP_CATALOG_TAG = "clawql/StoreIapCatalog" as const;

export class StoreIapCatalogService extends Context.Service<
  typeof CLAWQL_STORE_IAP_CATALOG_TAG,
  {
    readonly lookup: (productId: string) => Effect.Effect<StoreIapProduct | undefined>;
    readonly fixtureToken: (token: string) => Effect.Effect<boolean>;
    readonly fixtureEnabled: (env?: NodeJS.ProcessEnv) => Effect.Effect<boolean>;
  }
>()(CLAWQL_STORE_IAP_CATALOG_TAG) {}

export const storeIapCatalogLiveLayer: Layer.Layer<StoreIapCatalogService> = Layer.succeed(
  StoreIapCatalogService,
  StoreIapCatalogService.of({
    lookup: lookupStoreIapProductEffect,
    fixtureToken: isFixtureStorePurchaseTokenEffect,
    fixtureEnabled: storeIapFixtureEnabledEffect,
  })
);
