/**
 * Idempotent Stripe Products / Prices / Meter ensure for CPC hybrid billing.
 * Spec ops: docs/payments/stripe-products-ops.md
 */

import { Context, Effect, Layer } from "effect";
import type Stripe from "stripe";
import {
  StripeClientService,
  stripeClientLiveLayer,
  stripeTryPromise,
} from "./stripe-client-service.js";
import { StripeApiError, StripeNotConfigured } from "./stripe-errors.js";

export type CatalogPlanId = "pro" | "team";

export type CatalogPricePlan = {
  readonly planId: CatalogPlanId;
  readonly productName: string;
  readonly unitAmountCents: number;
  readonly envVar: "STRIPE_PRO_PRICE_ID" | "STRIPE_TEAM_PRICE_ID";
};

export type CatalogTopUp = {
  readonly label: string;
  readonly unitAmountCents: number;
  readonly envVar: string;
};

export type StripeCatalogDefaults = {
  readonly currency: string;
  readonly meterEventName: string;
  readonly plans: readonly CatalogPricePlan[];
  readonly topUps: readonly CatalogTopUp[];
};

export const DEFAULT_STRIPE_CATALOG: StripeCatalogDefaults = {
  currency: "usd",
  meterEventName: "clawql_inference_overage",
  plans: [
    {
      planId: "pro",
      productName: "ClawQL Pro",
      unitAmountCents: 2_900,
      envVar: "STRIPE_PRO_PRICE_ID",
    },
    {
      planId: "team",
      productName: "ClawQL Team",
      unitAmountCents: 9_900,
      envVar: "STRIPE_TEAM_PRICE_ID",
    },
  ],
  topUps: [
    { label: "Credits $20", unitAmountCents: 2_000, envVar: "STRIPE_CREDITS_TOPUP_20_PRICE_ID" },
    { label: "Credits $100", unitAmountCents: 10_000, envVar: "STRIPE_CREDITS_TOPUP_100_PRICE_ID" },
    { label: "Credits $500", unitAmountCents: 50_000, envVar: "STRIPE_CREDITS_TOPUP_500_PRICE_ID" },
  ],
};

export type CatalogResourceStatus = "planned" | "created" | "reused" | "missing_env";

export type CatalogPlanResult = {
  readonly planId: CatalogPlanId;
  readonly productId: string | null;
  readonly priceId: string | null;
  readonly envVar: string;
  readonly status: CatalogResourceStatus;
};

export type CatalogTopUpResult = {
  readonly label: string;
  readonly productId: string | null;
  readonly priceId: string | null;
  readonly envVar: string;
  readonly unitAmountCents: number;
  readonly status: CatalogResourceStatus;
};

export type CatalogMeterResult = {
  readonly eventName: string;
  readonly meterId: string | null;
  readonly meteredPriceId: string | null;
  readonly status: CatalogResourceStatus;
};

export type StripeCatalogEnsureResult = {
  readonly dryRun: boolean;
  readonly currency: string;
  readonly plans: readonly CatalogPlanResult[];
  readonly topUps: readonly CatalogTopUpResult[];
  readonly meter: CatalogMeterResult;
  /** Shell exports operators can paste after a live ensure. */
  readonly envExports: readonly string[];
};

export type StripeCatalogValidateResult = {
  readonly ok: boolean;
  readonly checks: readonly {
    readonly name: string;
    readonly ok: boolean;
    readonly detail: string;
  }[];
};

export type EnsureStripeCatalogInput = {
  readonly dryRun?: boolean;
  readonly includeTopUps?: boolean;
  readonly includeMeter?: boolean;
  readonly defaults?: StripeCatalogDefaults;
};

export class StripeCatalogService extends Context.Tag("clawql-payments/StripeCatalogService")<
  StripeCatalogService,
  {
    readonly ensureCatalog: (
      input?: EnsureStripeCatalogInput
    ) => Effect.Effect<StripeCatalogEnsureResult, StripeNotConfigured | StripeApiError>;
    readonly validateCatalogEnv: (
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<StripeCatalogValidateResult>;
  }
>() {}

function buildEnvExports(
  result: Omit<StripeCatalogEnsureResult, "envExports" | "dryRun">
): string[] {
  const lines: string[] = [];
  for (const p of result.plans) {
    if (p.priceId) lines.push(`export ${p.envVar}=${p.priceId}`);
  }
  for (const t of result.topUps) {
    if (t.priceId) lines.push(`export ${t.envVar}=${t.priceId}`);
  }
  if (result.meter.eventName) {
    lines.push(`export STRIPE_METER_EVENT_NAME=${result.meter.eventName}`);
  }
  if (result.meter.meteredPriceId) {
    lines.push(`export STRIPE_OVERAGE_PRICE_ID=${result.meter.meteredPriceId}`);
  }
  return lines;
}

function plannedResult(
  defaults: StripeCatalogDefaults,
  includeTopUps: boolean,
  includeMeter: boolean
): StripeCatalogEnsureResult {
  const plans: CatalogPlanResult[] = defaults.plans.map((p) => ({
    planId: p.planId,
    productId: null,
    priceId: null,
    envVar: p.envVar,
    status: "planned" as const,
  }));
  const topUps: CatalogTopUpResult[] = includeTopUps
    ? defaults.topUps.map((t) => ({
        label: t.label,
        productId: null,
        priceId: null,
        envVar: t.envVar,
        unitAmountCents: t.unitAmountCents,
        status: "planned" as const,
      }))
    : [];
  const meter: CatalogMeterResult = includeMeter
    ? {
        eventName: defaults.meterEventName,
        meterId: null,
        meteredPriceId: null,
        status: "planned",
      }
    : {
        eventName: defaults.meterEventName,
        meterId: null,
        meteredPriceId: null,
        status: "planned",
      };
  const base = { currency: defaults.currency, plans, topUps, meter };
  return {
    dryRun: true,
    ...base,
    envExports: [
      ...defaults.plans.map(
        (p) =>
          `# after live ensure: export ${p.envVar}=price_...  (${p.productName} ${p.unitAmountCents}/${defaults.currency}/mo)`
      ),
      ...(includeTopUps
        ? defaults.topUps.map(
            (t) => `# after live ensure: export ${t.envVar}=price_...  (${t.label})`
          )
        : []),
      ...(includeMeter
        ? [
            `# after live ensure: export STRIPE_METER_EVENT_NAME=${defaults.meterEventName}`,
            `# after live ensure: export STRIPE_OVERAGE_PRICE_ID=price_...`,
            `# when ready: export CLAWQL_PAYMENTS_REPORT_STRIPE_METER=1`,
          ]
        : []),
    ],
  };
}

const findProductByPlan = (
  stripe: Stripe,
  planId: string
): Effect.Effect<Stripe.Product | null, StripeApiError> =>
  stripeTryPromise(`list products for clawql_plan=${planId}`, async () => {
    const listed = await stripe.products.list({ limit: 100, active: true });
    return (
      listed.data.find(
        (p) => p.metadata?.clawql_plan === planId && p.metadata?.clawql_catalog === "1"
      ) ?? null
    );
  });

const findRecurringPrice = (
  stripe: Stripe,
  productId: string,
  unitAmountCents: number,
  currency: string
): Effect.Effect<Stripe.Price | null, StripeApiError> =>
  stripeTryPromise(`list prices for product ${productId}`, async () => {
    const listed = await stripe.prices.list({ product: productId, active: true, limit: 100 });
    return (
      listed.data.find(
        (pr) =>
          pr.recurring?.interval === "month" &&
          pr.unit_amount === unitAmountCents &&
          pr.currency === currency &&
          pr.metadata?.clawql_catalog === "1"
      ) ?? null
    );
  });

const ensureSubscriptionPlan = (
  stripe: Stripe,
  plan: CatalogPricePlan,
  currency: string
): Effect.Effect<CatalogPlanResult, StripeApiError> =>
  Effect.gen(function* () {
    let product = yield* findProductByPlan(stripe, plan.planId);
    let productStatus: CatalogResourceStatus = "reused";
    if (!product) {
      product = yield* stripeTryPromise(`create product ${plan.productName}`, () =>
        stripe.products.create({
          name: plan.productName,
          metadata: {
            clawql_catalog: "1",
            clawql_plan: plan.planId,
          },
        })
      );
      productStatus = "created";
    }

    let price = yield* findRecurringPrice(stripe, product.id, plan.unitAmountCents, currency);
    let status: CatalogResourceStatus = price ? "reused" : productStatus;
    if (!price) {
      price = yield* stripeTryPromise(`create price for ${plan.planId}`, () =>
        stripe.prices.create({
          product: product!.id,
          currency,
          unit_amount: plan.unitAmountCents,
          recurring: { interval: "month" },
          metadata: {
            clawql_catalog: "1",
            clawql_plan: plan.planId,
          },
        })
      );
      status = "created";
    }

    return {
      planId: plan.planId,
      productId: product.id,
      priceId: price.id,
      envVar: plan.envVar,
      status,
    };
  });

const ensureTopUp = (
  stripe: Stripe,
  topUp: CatalogTopUp,
  currency: string
): Effect.Effect<CatalogTopUpResult, StripeApiError> =>
  Effect.gen(function* () {
    const listed = yield* stripeTryPromise("list products for top-ups", () =>
      stripe.products.list({ limit: 100, active: true })
    );
    let product =
      listed.data.find(
        (p) =>
          p.metadata?.clawql_catalog === "1" &&
          p.metadata?.clawql_topup_cents === String(topUp.unitAmountCents)
      ) ?? null;
    if (!product) {
      product = yield* stripeTryPromise(`create top-up product ${topUp.label}`, () =>
        stripe.products.create({
          name: `ClawQL ${topUp.label}`,
          metadata: {
            clawql_catalog: "1",
            clawql_topup_cents: String(topUp.unitAmountCents),
          },
        })
      );
    }
    const prices = yield* stripeTryPromise(`list top-up prices ${product.id}`, () =>
      stripe.prices.list({ product: product!.id, active: true, limit: 100 })
    );
    let price =
      prices.data.find(
        (pr) =>
          !pr.recurring &&
          pr.unit_amount === topUp.unitAmountCents &&
          pr.currency === currency &&
          pr.metadata?.clawql_catalog === "1"
      ) ?? null;
    let status: CatalogResourceStatus = price ? "reused" : "created";
    if (!price) {
      price = yield* stripeTryPromise(`create top-up price ${topUp.label}`, () =>
        stripe.prices.create({
          product: product!.id,
          currency,
          unit_amount: topUp.unitAmountCents,
          metadata: {
            clawql_catalog: "1",
            clawql_credit_topup: "1",
            clawql_topup_cents: String(topUp.unitAmountCents),
          },
        })
      );
      status = "created";
    }
    return {
      label: topUp.label,
      productId: product.id,
      priceId: price.id,
      envVar: topUp.envVar,
      unitAmountCents: topUp.unitAmountCents,
      status,
    };
  });

const ensureMeter = (
  stripe: Stripe,
  eventName: string,
  currency: string
): Effect.Effect<CatalogMeterResult, StripeApiError> =>
  Effect.gen(function* () {
    // Billing Meters API — list then create if missing
    const meters = yield* stripeTryPromise("list billing meters", async () => {
      const api = stripe.billing?.meters;
      if (!api?.list) return { data: [] as Stripe.Billing.Meter[] };
      return api.list({ limit: 100 });
    });
    let meter =
      meters.data.find((m) => m.event_name === eventName && m.status === "active") ?? null;
    let status: CatalogResourceStatus = meter ? "reused" : "created";
    if (!meter) {
      meter = yield* stripeTryPromise(`create billing meter ${eventName}`, () =>
        stripe.billing.meters.create({
          display_name: "ClawQL inference overage",
          event_name: eventName,
          default_aggregation: { formula: "sum" },
          customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
          value_settings: { event_payload_key: "value" },
        })
      );
      status = "created";
    }

    const productName = "ClawQL Inference Overage";
    const products = yield* stripeTryPromise("list overage products", () =>
      stripe.products.list({ limit: 100, active: true })
    );
    let product =
      products.data.find(
        (p) => p.metadata?.clawql_catalog === "1" && p.metadata?.clawql_meter === eventName
      ) ?? null;
    if (!product) {
      product = yield* stripeTryPromise("create overage product", () =>
        stripe.products.create({
          name: productName,
          metadata: { clawql_catalog: "1", clawql_meter: eventName },
        })
      );
    }

    const prices = yield* stripeTryPromise("list overage prices", () =>
      stripe.prices.list({ product: product!.id, active: true, limit: 100 })
    );
    let price =
      prices.data.find(
        (pr) =>
          pr.recurring?.usage_type === "metered" &&
          pr.currency === currency &&
          pr.metadata?.clawql_catalog === "1"
      ) ?? null;
    if (!price) {
      price = yield* stripeTryPromise("create metered overage price", () =>
        stripe.prices.create({
          product: product!.id,
          currency,
          billing_scheme: "per_unit",
          recurring: {
            interval: "month",
            usage_type: "metered",
            meter: meter!.id,
          },
          metadata: { clawql_catalog: "1", clawql_meter: eventName },
        })
      );
      status = "created";
    }

    return {
      eventName,
      meterId: meter.id,
      meteredPriceId: price.id,
      status,
    };
  });

export const validateStripeCatalogEnv = (
  env: NodeJS.ProcessEnv = process.env,
  defaults: StripeCatalogDefaults = DEFAULT_STRIPE_CATALOG
): StripeCatalogValidateResult => {
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  const secret = Boolean(env.STRIPE_SECRET_KEY?.trim());
  checks.push({
    name: "STRIPE_SECRET_KEY",
    ok: secret,
    detail: secret ? "set" : "missing — required for live Checkout / catalog ensure",
  });
  for (const p of defaults.plans) {
    const v = env[p.envVar]?.trim();
    checks.push({
      name: p.envVar,
      ok: Boolean(v),
      detail: v ? v : `missing — required for ${p.planId} Checkout / subscriptions`,
    });
  }
  const meter = env.STRIPE_METER_EVENT_NAME?.trim();
  checks.push({
    name: "STRIPE_METER_EVENT_NAME",
    ok: Boolean(meter),
    detail: meter
      ? meter
      : `missing — recommended (${defaults.meterEventName}); required when CLAWQL_PAYMENTS_REPORT_STRIPE_METER=1`,
  });
  return { ok: checks.every((c) => c.ok || c.name === "STRIPE_METER_EVENT_NAME"), checks };
};

export const stripeCatalogLiveLayer = (
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<StripeCatalogService> =>
  Layer.succeed(StripeCatalogService, {
    ensureCatalog: (input = {}) =>
      Effect.gen(function* () {
        const defaults = input.defaults ?? DEFAULT_STRIPE_CATALOG;
        const dryRun = input.dryRun === true;
        const includeTopUps = input.includeTopUps !== false;
        const includeMeter = input.includeMeter !== false;

        if (dryRun) {
          return plannedResult(defaults, includeTopUps, includeMeter);
        }

        const client = yield* StripeClientService;
        const stripe = yield* client.getClient();

        const plans: CatalogPlanResult[] = [];
        for (const plan of defaults.plans) {
          plans.push(yield* ensureSubscriptionPlan(stripe, plan, defaults.currency));
        }

        const topUps: CatalogTopUpResult[] = [];
        if (includeTopUps) {
          for (const t of defaults.topUps) {
            topUps.push(yield* ensureTopUp(stripe, t, defaults.currency));
          }
        }

        const meter = includeMeter
          ? yield* ensureMeter(stripe, defaults.meterEventName, defaults.currency)
          : {
              eventName: defaults.meterEventName,
              meterId: null,
              meteredPriceId: null,
              status: "planned" as const,
            };

        const base = { currency: defaults.currency, plans, topUps, meter };
        return {
          dryRun: false,
          ...base,
          envExports: buildEnvExports(base),
        };
      }).pipe(Effect.provide(stripeClientLiveLayer(env))),

    validateCatalogEnv: (e = env) => Effect.succeed(validateStripeCatalogEnv(e)),
  });

export const ensureStripeCatalog = (
  input: EnsureStripeCatalogInput = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<StripeCatalogEnsureResult> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const catalog = yield* StripeCatalogService;
      return yield* catalog.ensureCatalog(input);
    }).pipe(Effect.provide(stripeCatalogLiveLayer(env)))
  );

export const validateStripeCatalogEnvEffect = (
  env: NodeJS.ProcessEnv = process.env
): Promise<StripeCatalogValidateResult> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const catalog = yield* StripeCatalogService;
      return yield* catalog.validateCatalogEnv(env);
    }).pipe(Effect.provide(stripeCatalogLiveLayer(env)))
  );
