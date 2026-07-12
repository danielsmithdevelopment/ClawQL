export class StripeNotConfiguredError extends Error {
  constructor(message = "Stripe is not configured — set STRIPE_SECRET_KEY") {
    super(message);
    this.name = "StripeNotConfiguredError";
  }
}

export class StripeWebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeWebhookVerificationError";
  }
}
