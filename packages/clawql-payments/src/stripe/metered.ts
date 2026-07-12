import { createStripeClient } from "./client.js";

export type MeteredUsageInput = {
  eventName: string;
  stripeCustomerId: string;
  value: number;
  identifier?: string;
  timestamp?: number;
  env?: NodeJS.ProcessEnv;
};

export async function reportMeteredUsage(
  input: MeteredUsageInput
): Promise<{ id: string; value: number }> {
  const env = input.env ?? process.env;
  const stripe = createStripeClient(env);
  const event = await stripe.billing.meterEvents.create({
    event_name: input.eventName,
    payload: {
      stripe_customer_id: input.stripeCustomerId,
      value: String(input.value),
    },
    identifier: input.identifier,
    timestamp: input.timestamp,
  });

  return {
    id: event.identifier,
    value: input.value,
  };
}
