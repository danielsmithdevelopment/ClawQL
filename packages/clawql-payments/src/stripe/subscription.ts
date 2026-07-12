import { getPlanDefinition, type ClawqlPlanId } from "../plans/tiers.js";
import { createStripeClient } from "./client.js";
import { StripeNotConfiguredError } from "./errors.js";

export type StripeSubscriptionInput = {
  customerId: string;
  plan: "pro" | "team";
  env?: NodeJS.ProcessEnv;
};

export type StripeSubscriptionResult = {
  id: string;
  customerId: string;
  plan: string;
  priceId: string;
  status: string;
};

function resolvePriceId(plan: ClawqlPlanId, _env: NodeJS.ProcessEnv): string {
  const priceId = getPlanDefinition(plan).stripe_price_id;
  if (!priceId) {
    throw new StripeNotConfiguredError(
      `Stripe price id not configured for plan "${plan}" — set STRIPE_${plan.toUpperCase()}_PRICE_ID`
    );
  }
  return priceId;
}

export async function createStripeSubscription(
  input: StripeSubscriptionInput
): Promise<StripeSubscriptionResult> {
  const env = input.env ?? process.env;
  const stripe = createStripeClient(env);
  const priceId = resolvePriceId(input.plan, env);

  const subscription = await stripe.subscriptions.create({
    customer: input.customerId,
    items: [{ price: priceId }],
    payment_behavior: "default_incomplete",
    expand: ["latest_invoice.payment_intent"],
  });

  return {
    id: subscription.id,
    customerId:
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    plan: input.plan,
    priceId,
    status: subscription.status,
  };
}
