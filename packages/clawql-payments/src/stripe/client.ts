import Stripe from "stripe";
import { StripeNotConfiguredError } from "./errors.js";

export function resolveStripeSecretKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new StripeNotConfiguredError();
  }
  return key;
}

export {
  isStripeConfigured,
  StripeClientService,
  stripeClientLiveLayer,
} from "./stripe-client-service.js";

export function createStripeClient(env: NodeJS.ProcessEnv = process.env): Stripe {
  return new Stripe(resolveStripeSecretKey(env));
}

export function createStripeClientOptional(env: NodeJS.ProcessEnv = process.env): Stripe | null {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key);
}
