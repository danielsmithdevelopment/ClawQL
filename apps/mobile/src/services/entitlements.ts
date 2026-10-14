/**
 * Org plan entitlements for PhoneApprove — fixture store-IAP sandbox today;
 * live StoreKit / Play verify posts to the managed billing API later.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Context, Data, Effect, Layer, Schema } from "effect";

import { decodeUnknownEffect } from "../domain/schemas";
import { loadMobileConfigEffect } from "./config";

const ENTITLEMENTS_KEY = "clawql.mobile.entitlements.v1";

export const MobilePlanId = Schema.Literals(["free", "pro", "team", "enterprise"]);
export type MobilePlanId = Schema.Schema.Type<typeof MobilePlanId>;

export const MobileBillingMode = Schema.Literals([
  "stripe_checkout",
  "stripe_invoice",
  "hybrid",
  "credits_only",
  "store_iap",
  "dual",
]);
export type MobileBillingMode = Schema.Schema.Type<typeof MobileBillingMode>;

export const MobileEntitlements = Schema.Struct({
  planId: MobilePlanId,
  billingMode: MobileBillingMode,
  /** Store product id when billingMode is store_iap / dual. */
  productId: Schema.optional(Schema.String),
  store: Schema.optional(Schema.Literals(["app_store", "play", "fixture"])),
  seats: Schema.Number,
  renewsAtMs: Schema.optional(Schema.Number),
  /** Human label for Profile. */
  planLabel: Schema.String,
  /** Fixture sandbox purchase id (not a real receipt). */
  fixturePurchaseId: Schema.optional(Schema.String),
});
export type MobileEntitlements = Schema.Schema.Type<typeof MobileEntitlements>;

export class EntitlementsError extends Data.TaggedError("EntitlementsError")<{
  readonly reason: string;
}> {}

const PLAN_SEATS: Record<MobilePlanId, number> = {
  free: 1,
  pro: 1,
  team: 20,
  enterprise: 999,
};

const PLAN_LABEL: Record<MobilePlanId, string> = {
  free: "Free",
  pro: "Pro",
  team: "Team",
  enterprise: "Enterprise",
};

const STORE_PRODUCT: Record<"pro" | "team", string> = {
  pro: "clawql_pro_monthly",
  team: "clawql_team_monthly",
};

export function defaultEntitlements(planId: MobilePlanId = "free"): MobileEntitlements {
  return {
    planId,
    billingMode: planId === "free" ? "credits_only" : "store_iap",
    seats: PLAN_SEATS[planId],
    planLabel: PLAN_LABEL[planId],
    store: planId === "free" ? undefined : "fixture",
    productId: planId === "pro" || planId === "team" ? STORE_PRODUCT[planId] : undefined,
  };
}

export function loadEntitlementsEffect(): Effect.Effect<MobileEntitlements, EntitlementsError> {
  return Effect.gen(function* () {
    const raw = yield* Effect.tryPromise({
      try: () => AsyncStorage.getItem(ENTITLEMENTS_KEY),
      catch: (cause) =>
        new EntitlementsError({
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    });
    if (!raw) return defaultEntitlements("free");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return defaultEntitlements("free");
    }
    return yield* decodeUnknownEffect(MobileEntitlements, parsed).pipe(
      Effect.mapError((e) => new EntitlementsError({ reason: e.message })),
      Effect.catch(() => Effect.succeed(defaultEntitlements("free")))
    );
  });
}

function persist(ent: MobileEntitlements): Effect.Effect<MobileEntitlements, EntitlementsError> {
  return Effect.tryPromise({
    try: async () => {
      await AsyncStorage.setItem(ENTITLEMENTS_KEY, JSON.stringify(ent));
      return ent;
    },
    catch: (cause) =>
      new EntitlementsError({
        reason: cause instanceof Error ? cause.message : String(cause),
      }),
  });
}

/**
 * Fixture / sandbox subscribe — flips local entitlements to Pro or Team via
 * store_iap. Live path will verify a StoreKit / Play token server-side.
 */
export function subscribeStoreSandboxEffect(
  planId: "pro" | "team"
): Effect.Effect<MobileEntitlements, EntitlementsError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (!config.fixtureMode) {
      // Live StoreKit / Play not wired yet — refuse rather than fake a receipt.
      return yield* Effect.fail(
        new EntitlementsError({
          reason: "store_iap_not_configured — use fixture mode or web Stripe Checkout",
        })
      );
    }
    const renewsAtMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const next: MobileEntitlements = {
      planId,
      billingMode: "store_iap",
      productId: STORE_PRODUCT[planId],
      store: "fixture",
      seats: PLAN_SEATS[planId],
      renewsAtMs,
      planLabel: PLAN_LABEL[planId],
      fixturePurchaseId: `fixture_iap_${planId}_${Date.now()}`,
    };
    return yield* persist(next);
  });
}

/** Restore from local fixture purchase record (live: App Store / Play restore). */
export function restorePurchasesEffect(): Effect.Effect<MobileEntitlements, EntitlementsError> {
  return Effect.gen(function* () {
    const current = yield* loadEntitlementsEffect();
    if (current.planId !== "free" && current.fixturePurchaseId) {
      return current;
    }
    const config = yield* loadMobileConfigEffect();
    if (!config.fixtureMode) {
      return yield* Effect.fail(
        new EntitlementsError({ reason: "no_purchases_to_restore" })
      );
    }
    // Fixture restore finds the last sandbox subscribe if still on free after wipe.
    const raw = yield* Effect.tryPromise({
      try: () => AsyncStorage.getItem(ENTITLEMENTS_KEY),
      catch: (cause) =>
        new EntitlementsError({
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    });
    if (!raw) {
      return yield* Effect.fail(new EntitlementsError({ reason: "no_purchases_to_restore" }));
    }
    return current;
  });
}

export function clearEntitlementsEffect(): Effect.Effect<MobileEntitlements, EntitlementsError> {
  return persist(defaultEntitlements("free"));
}

export const CLAWQL_ENTITLEMENTS_TAG = "clawql/MobileEntitlements" as const;

export class MobileEntitlementsService extends Context.Service<
  typeof CLAWQL_ENTITLEMENTS_TAG,
  {
    readonly load: () => Effect.Effect<MobileEntitlements, EntitlementsError>;
    readonly subscribeSandbox: (
      planId: "pro" | "team"
    ) => Effect.Effect<MobileEntitlements, EntitlementsError>;
    readonly restore: () => Effect.Effect<MobileEntitlements, EntitlementsError>;
    readonly clear: () => Effect.Effect<MobileEntitlements, EntitlementsError>;
  }
>()(CLAWQL_ENTITLEMENTS_TAG) {}

export const MobileEntitlementsLive = Layer.succeed(MobileEntitlementsService, {
  load: loadEntitlementsEffect,
  subscribeSandbox: subscribeStoreSandboxEffect,
  restore: restorePurchasesEffect,
  clear: clearEntitlementsEffect,
});
