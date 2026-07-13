import Stripe from "stripe";
import { Context, Effect, Layer } from "effect";
import { StripeApiError, StripeNotConfigured } from "./stripe-errors.js";

function resolveStripeSecretKey(env: NodeJS.ProcessEnv): string | undefined {
  return env.STRIPE_SECRET_KEY?.trim() || undefined;
}

/** Effect service for Stripe SDK client lifecycle. */
export class StripeClientService extends Context.Tag("clawql/StripeClientService")<
  StripeClientService,
  {
    readonly isConfigured: () => boolean;
    readonly getClient: () => Effect.Effect<Stripe, StripeNotConfigured>;
    readonly getClientOptional: () => Stripe | null;
  }
>() {}

export function isStripeConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(resolveStripeSecretKey(env));
}

export function stripeClientLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<StripeClientService> {
  let cached: Stripe | null = null;

  return Layer.succeed(
    StripeClientService,
    StripeClientService.of({
      isConfigured: () => isStripeConfigured(env),
      getClient: () => {
        const key = resolveStripeSecretKey(env);
        if (!key) {
          return Effect.fail(
            new StripeNotConfigured({
              reason: "Stripe is not configured — set STRIPE_SECRET_KEY",
            })
          );
        }
        if (!cached) {
          cached = new Stripe(key);
        }
        return Effect.succeed(cached);
      },
      getClientOptional: () => {
        const key = resolveStripeSecretKey(env);
        if (!key) return null;
        if (!cached) cached = new Stripe(key);
        return cached;
      },
    })
  );
}

export function stripeTryPromise<A>(
  reason: string,
  fn: () => Promise<A>
): Effect.Effect<A, StripeApiError> {
  return Effect.tryPromise({
    try: fn,
    catch: (cause) => new StripeApiError({ reason, cause }),
  });
}
