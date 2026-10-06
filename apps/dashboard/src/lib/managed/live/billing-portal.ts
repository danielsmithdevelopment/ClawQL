import { createCustomerPortalSession } from "clawql-payments";
import { Effect } from "effect";

import {
  managedStripeCustomerId,
  readManagedDataSource,
} from "@/lib/managed/data-source";

export type ManagedBillingError = {
  readonly _tag: "ManagedBillingError";
  readonly reason: string;
};

export const createManagedPortalSessionEffect = (input: {
  readonly returnUrl: string;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<
  { readonly url: string; readonly customerId: string; readonly source: "live" },
  ManagedBillingError
> =>
  Effect.gen(function* () {
    const env = input.env ?? process.env;
    if (readManagedDataSource(env) === "fixture") {
      return yield* Effect.fail({
        _tag: "ManagedBillingError" as const,
        reason: "Stripe portal disabled while CLAWQL_MANAGED_DATA_SOURCE=fixture",
      });
    }
    const customerId = managedStripeCustomerId(env);
    if (!customerId) {
      return yield* Effect.fail({
        _tag: "ManagedBillingError" as const,
        reason:
          "Set CLAWQL_STRIPE_CUSTOMER_ID (or STRIPE_CUSTOMER_ID) for the managed Stripe portal",
      });
    }
    const session = yield* Effect.tryPromise({
      try: () =>
        createCustomerPortalSession({
          customerId,
          returnUrl: input.returnUrl,
          env,
        }),
      catch: (cause) => ({
        _tag: "ManagedBillingError" as const,
        reason: cause instanceof Error ? cause.message : String(cause),
      }),
    });
    return { url: session.url, customerId: session.customerId, source: "live" as const };
  });
