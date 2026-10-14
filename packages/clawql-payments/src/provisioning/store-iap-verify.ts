/**
 * App Store / Play purchase verify → org plan entitlements (store_iap / dual).
 * Fixture tokens work today; live Apple JWS / Play token verify waits on Day-0 secrets.
 *
 * @see docs/specs/billing/mobile-store-iap-v0.1.md
 */

import { Context, Data, Effect, Layer } from "effect";
import {
  OrgCreditsError,
  OrgCreditsService,
  type OrgBillingMode,
  type OrgRecord,
} from "../credits/org.js";
import { CLAWQL_PLANS, type ClawqlPlanId } from "../plans/tiers.js";
import { ProvisionOrgError, ProvisionOrgService } from "./provision-org-service.js";
import {
  StoreIapCatalogService,
  type StoreIapPlatform,
  type StoreIapProduct,
} from "./store-iap-catalog.js";

export class StoreIapVerifyError extends Data.TaggedError("StoreIapVerifyError")<{
  readonly reason: string;
  readonly code:
    | "invalid_body"
    | "unknown_product"
    | "invalid_token"
    | "not_configured"
    | "org_missing"
    | "provision_failed";
}> {}

export type StoreIapVerifyInput = {
  readonly store: StoreIapPlatform;
  readonly productId: string;
  readonly purchaseToken: string;
  /** When set, patch existing org; otherwise provision a new store_iap org. */
  readonly orgId?: string;
  readonly orgName?: string;
  readonly ownerEmail?: string;
  readonly correlationId?: string;
  readonly env?: NodeJS.ProcessEnv;
};

export type BillingEntitlements = {
  readonly orgId: string;
  readonly planId: ClawqlPlanId;
  readonly billingMode: OrgBillingMode;
  readonly seats: number;
  readonly productId?: string;
  readonly store?: StoreIapPlatform;
  readonly renewsAtMs?: number;
  readonly originalTransactionId?: string;
};

export type StoreIapVerifyResult = {
  readonly entitlements: BillingEntitlements;
  readonly provisioned: boolean;
  readonly fixture: boolean;
};

function periodMs(period: StoreIapProduct["period"]): number {
  return period === "annual" ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
}

function mapOrgErr(e: OrgCreditsError, code: StoreIapVerifyError["code"]): StoreIapVerifyError {
  return new StoreIapVerifyError({ reason: e.reason, code });
}

function toEntitlements(
  org: OrgRecord,
  product: StoreIapProduct | undefined,
  store: StoreIapPlatform | undefined,
  originalTransactionId: string | undefined
): BillingEntitlements {
  const planId = (org.planId ?? product?.planId ?? "free") as ClawqlPlanId;
  const seats = org.seatLimit ?? CLAWQL_PLANS[planId].seats;
  const billingMode: OrgBillingMode = org.billingMode ?? "credits_only";
  return {
    orgId: org.orgId,
    planId,
    billingMode,
    seats: Number.isFinite(seats) ? seats : 1,
    productId: product?.productId ?? org.storeProductId,
    store: store ?? org.storePlatform,
    renewsAtMs: product ? Date.now() + periodMs(product.period) : undefined,
    originalTransactionId: originalTransactionId ?? org.storeOriginalTransactionId,
  };
}

export function verifyStorePurchaseEffect(
  input: StoreIapVerifyInput
): Effect.Effect<
  StoreIapVerifyResult,
  StoreIapVerifyError | ProvisionOrgError,
  StoreIapCatalogService | OrgCreditsService | ProvisionOrgService
> {
  return Effect.gen(function* () {
    const catalog = yield* StoreIapCatalogService;
    const orgs = yield* OrgCreditsService;
    const env = input.env ?? process.env;

    const productId = input.productId.trim();
    const purchaseToken = input.purchaseToken.trim();
    if (!productId || !purchaseToken) {
      return yield* Effect.fail(
        new StoreIapVerifyError({
          reason: "productId and purchaseToken are required",
          code: "invalid_body",
        })
      );
    }

    const product = yield* catalog.lookup(productId);
    if (!product) {
      return yield* Effect.fail(
        new StoreIapVerifyError({
          reason: `Unknown store product: ${productId}`,
          code: "unknown_product",
        })
      );
    }

    const fixtureToken = yield* catalog.fixtureToken(purchaseToken);
    const fixtureEnv = yield* catalog.fixtureEnabled(env);
    const fixture = input.store === "fixture" || fixtureToken || fixtureEnv;

    if (!fixture) {
      return yield* Effect.fail(
        new StoreIapVerifyError({
          reason:
            "store_iap_not_configured — set CLAWQL_STORE_IAP_FIXTURE=1 for sandbox, or wire Apple/Play verify after Day-0",
          code: "not_configured",
        })
      );
    }

    const orgIdHint = input.orgId?.trim().toLowerCase();
    let org: OrgRecord;
    let provisioned = false;
    const platform: StoreIapPlatform =
      input.store === "play" ? "play" : input.store === "app_store" ? "app_store" : "fixture";

    if (orgIdHint) {
      const existing = yield* orgs
        .get(orgIdHint)
        .pipe(Effect.mapError((e) => mapOrgErr(e, "org_missing")));
      if (!existing) {
        return yield* Effect.fail(
          new StoreIapVerifyError({
            reason: `Unknown org: ${orgIdHint}`,
            code: "org_missing",
          })
        );
      }
      org = yield* orgs
        .patchBilling({
          orgId: existing.orgId,
          planId: product.planId,
          billingMode: existing.billingMode === "dual" ? "dual" : "store_iap",
          storeProductId: product.productId,
          storeOriginalTransactionId: purchaseToken,
          storePlatform: platform,
        })
        .pipe(Effect.mapError((e) => mapOrgErr(e, "provision_failed")));
    } else {
      const orgName = input.orgName?.trim();
      const ownerEmail = input.ownerEmail?.trim();
      if (!orgName || !ownerEmail) {
        return yield* Effect.fail(
          new StoreIapVerifyError({
            reason: "orgId or (orgName + ownerEmail) required to provision",
            code: "invalid_body",
          })
        );
      }
      const provision = yield* ProvisionOrgService;
      const result = yield* provision
        .provisionOrg({
          orgName,
          ownerEmail,
          planId: product.planId,
          createdVia: "self_serve",
          billingMode: "store_iap",
          correlationId: input.correlationId,
          env,
        })
        .pipe(
          Effect.mapError((e) =>
            e instanceof ProvisionOrgError
              ? e
              : new StoreIapVerifyError({
                  reason:
                    e && typeof e === "object" && "reason" in e
                      ? String((e as { reason: string }).reason)
                      : "store_iap provision failed",
                  code: "provision_failed",
                })
          )
        );
      provisioned = !result.idempotentReplay;
      org = yield* orgs
        .patchBilling({
          orgId: result.orgId,
          planId: product.planId,
          billingMode: "store_iap",
          storeProductId: product.productId,
          storeOriginalTransactionId: purchaseToken,
          storePlatform: "fixture",
        })
        .pipe(Effect.mapError((e) => mapOrgErr(e, "provision_failed")));
    }

    return {
      entitlements: toEntitlements(org, product, platform, purchaseToken),
      provisioned,
      fixture: true,
    };
  });
}

export function getBillingEntitlementsEffect(
  orgId: string
): Effect.Effect<
  BillingEntitlements | null,
  StoreIapVerifyError,
  OrgCreditsService | StoreIapCatalogService
> {
  return Effect.gen(function* () {
    const orgs = yield* OrgCreditsService;
    const catalog = yield* StoreIapCatalogService;
    const org = yield* orgs
      .get(orgId.trim().toLowerCase())
      .pipe(Effect.mapError((e) => mapOrgErr(e, "org_missing")));
    if (!org) return null;
    const product = org.storeProductId ? yield* catalog.lookup(org.storeProductId) : undefined;
    return toEntitlements(org, product, org.storePlatform, org.storeOriginalTransactionId);
  });
}

export class StoreIapVerifyService extends Context.Service<
  StoreIapVerifyService,
  {
    readonly verify: (
      input: StoreIapVerifyInput
    ) => Effect.Effect<StoreIapVerifyResult, StoreIapVerifyError | ProvisionOrgError>;
    readonly entitlements: (
      orgId: string
    ) => Effect.Effect<BillingEntitlements | null, StoreIapVerifyError>;
  }
>()("clawql/StoreIapVerifyService") {}

export function storeIapVerifyLiveLayer(): Layer.Layer<StoreIapVerifyService> {
  return Layer.succeed(
    StoreIapVerifyService,
    StoreIapVerifyService.of({
      verify: (input) =>
        verifyStorePurchaseEffect(input) as Effect.Effect<
          StoreIapVerifyResult,
          StoreIapVerifyError | ProvisionOrgError
        >,
      entitlements: (orgId) =>
        getBillingEntitlementsEffect(orgId) as Effect.Effect<
          BillingEntitlements | null,
          StoreIapVerifyError
        >,
    })
  );
}
