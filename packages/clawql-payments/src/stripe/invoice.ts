import { createStripeClient } from "./client.js";

export type StripeInvoiceInput = {
  customerId: string;
  amountCents: number;
  description?: string;
  currency?: string;
  env?: NodeJS.ProcessEnv;
};

export type StripeInvoiceResult = {
  id: string;
  customerId: string;
  amountCents: number;
  status: string;
  hostedInvoiceUrl?: string | null;
};

export async function createStripeInvoice(
  input: StripeInvoiceInput
): Promise<StripeInvoiceResult> {
  const env = input.env ?? process.env;
  const stripe = createStripeClient(env);
  const currency = input.currency ?? "usd";

  await stripe.invoiceItems.create({
    customer: input.customerId,
    amount: input.amountCents,
    currency,
    description: input.description,
  });

  const invoice = await stripe.invoices.create({
    customer: input.customerId,
    auto_advance: true,
    collection_method: "send_invoice",
    days_until_due: 30,
  });

  if (!invoice.id) {
    throw new Error("Stripe invoice create did not return an id");
  }

  const finalized =
    invoice.status === "draft"
      ? await stripe.invoices.finalizeInvoice(invoice.id)
      : invoice;

  return {
    id: finalized.id ?? invoice.id,
    customerId: input.customerId,
    amountCents: input.amountCents,
    status: finalized.status ?? "open",
    hostedInvoiceUrl: finalized.hosted_invoice_url,
  };
}
