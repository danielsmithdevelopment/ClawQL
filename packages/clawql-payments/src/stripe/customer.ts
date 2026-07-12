import { createStripeClient } from "./client.js";

export type StripeCustomerInput = {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
  env?: NodeJS.ProcessEnv;
};

export type StripeCustomerResult = {
  id: string;
  email: string;
  name?: string | null;
  status: "live";
};

export async function createStripeCustomer(
  input: StripeCustomerInput
): Promise<StripeCustomerResult> {
  const env = input.env ?? process.env;
  const stripe = createStripeClient(env);
  const customer = await stripe.customers.create({
    email: input.email,
    name: input.name,
    metadata: input.metadata,
  });

  return {
    id: customer.id,
    email: customer.email ?? input.email,
    name: customer.name,
    status: "live",
  };
}
