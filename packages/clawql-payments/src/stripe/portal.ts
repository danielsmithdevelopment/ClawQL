import { createStripeClient } from "./client.js";

export type PortalSessionInput = {
  customerId: string;
  returnUrl: string;
  env?: NodeJS.ProcessEnv;
};

export async function createCustomerPortalSession(
  input: PortalSessionInput
): Promise<{ url: string; customerId: string }> {
  const env = input.env ?? process.env;
  const stripe = createStripeClient(env);
  const session = await stripe.billingPortal.sessions.create({
    customer: input.customerId,
    return_url: input.returnUrl,
  });

  return {
    url: session.url,
    customerId: input.customerId,
  };
}
