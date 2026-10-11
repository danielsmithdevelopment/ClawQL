import { describe, expect, it, vi, afterEach } from "vitest";
import { Effect, Layer } from "effect";
import {
  buildCheckoutSessionMetadata,
  StripeBillingService,
  stripeBillingLiveLayer,
  type CheckoutSessionInput,
} from "./stripe-billing-service.js";
import { StripeClientService } from "./stripe-client-service.js";
import { paymentsConfigLiveLayer } from "../config/payments-config-service.js";
import { resetPaymentsEffectRuntimeForTests } from "../runtime/payments-effect-runtime.js";

describe("buildCheckoutSessionMetadata", () => {
  it("emits CPC keys for provisionOrg handoff", () => {
    expect(
      buildCheckoutSessionMetadata({
        orgName: " Acme ",
        plan: "pro",
        ownerEmail: " owner@acme.com ",
        billingMode: "hybrid",
      })
    ).toEqual({
      clawql_provision_org: "1",
      clawql_org_name: "Acme",
      clawql_plan: "pro",
      clawql_billing_mode: "hybrid",
      clawql_owner_email: "owner@acme.com",
    });
  });

  it("defaults billingMode to stripe_checkout", () => {
    expect(
      buildCheckoutSessionMetadata({
        orgName: "Co",
        plan: "team",
        ownerEmail: "a@b.co",
      }).clawql_billing_mode
    ).toBe("stripe_checkout");
  });

  it("does not bind supabase user without proof", () => {
    expect(
      buildCheckoutSessionMetadata({
        orgName: "Co",
        plan: "team",
        ownerEmail: "a@b.co",
      })
    ).not.toHaveProperty("clawql_supabase_user_id");
  });
});

describe("StripeBillingService.createCheckoutSession", () => {
  afterEach(() => {
    resetPaymentsEffectRuntimeForTests();
    vi.restoreAllMocks();
  });

  it("creates subscription Checkout with CPC metadata via mocked Stripe client", async () => {
    const create = vi.fn(async (params: Record<string, unknown>) => {
      expect(params.mode).toBe("subscription");
      expect(params.customer_email).toBe("owner@acme.com");
      expect(params.success_url).toBe("https://clawql.com/signup/thanks/");
      expect(params.cancel_url).toBe("https://clawql.com/signup/");
      expect(params.line_items).toEqual([{ price: "price_pro_test", quantity: 1 }]);
      expect(params.metadata).toMatchObject({
        clawql_provision_org: "1",
        clawql_org_name: "Acme",
        clawql_plan: "pro",
        clawql_billing_mode: "stripe_checkout",
        clawql_owner_email: "owner@acme.com",
      });
      return {
        id: "cs_test_123",
        url: "https://checkout.stripe.com/c/pay/cs_test_123",
      };
    });

    const mockClient = {
      checkout: { sessions: { create } },
    };

    const mockStripeLayer = Layer.succeed(
      StripeClientService,
      StripeClientService.of({
        isConfigured: () => true,
        getClient: () => Effect.succeed(mockClient as never),
        getClientOptional: () => mockClient as never,
      })
    );

    const env: NodeJS.ProcessEnv = {
      CLAWQL_HOME: "/tmp/clawql-checkout-test",
      STRIPE_PRO_PRICE_ID: "price_pro_test",
      STRIPE_TEAM_PRICE_ID: "price_team_test",
    };

    const layer = stripeBillingLiveLayer(env).pipe(
      Layer.provide(Layer.merge(mockStripeLayer, paymentsConfigLiveLayer(env)))
    );

    const input: CheckoutSessionInput = {
      plan: "pro",
      orgName: "Acme",
      ownerEmail: "owner@acme.com",
      successUrl: "https://clawql.com/signup/thanks/",
      cancelUrl: "https://clawql.com/signup/",
      env,
    };

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const billing = yield* StripeBillingService;
        return yield* billing.createCheckoutSession(input);
      }).pipe(Effect.provide(layer))
    );

    expect(result).toEqual({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
      plan: "pro",
      priceId: "price_pro_test",
    });
    expect(create).toHaveBeenCalledOnce();
  });

  it("fails validation when orgName is missing", async () => {
    const mockStripeLayer = Layer.succeed(
      StripeClientService,
      StripeClientService.of({
        isConfigured: () => true,
        getClient: () =>
          Effect.succeed({
            checkout: { sessions: { create: vi.fn() } },
          } as never),
        getClientOptional: () => null,
      })
    );
    const env: NodeJS.ProcessEnv = {
      CLAWQL_HOME: "/tmp/clawql-checkout-test",
      STRIPE_PRO_PRICE_ID: "price_pro_test",
    };
    const layer = stripeBillingLiveLayer(env).pipe(
      Layer.provide(Layer.merge(mockStripeLayer, paymentsConfigLiveLayer(env)))
    );

    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const billing = yield* StripeBillingService;
          return yield* billing.createCheckoutSession({
            plan: "pro",
            orgName: "  ",
            ownerEmail: "a@b.co",
            successUrl: "https://ok",
            cancelUrl: "https://cancel",
            env,
          });
        }).pipe(Effect.provide(layer))
      )
    ).rejects.toMatchObject({
      name: expect.stringContaining("StripeApiError"),
    });
  });
});
