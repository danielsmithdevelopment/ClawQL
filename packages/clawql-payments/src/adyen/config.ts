/** Adyen Checkout adapter configuration. */

export function isAdyenConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ADYEN_API_KEY?.trim() && env.ADYEN_MERCHANT_ACCOUNT?.trim());
}

export function isAdyenEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_ADYEN_ENABLED?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  return isAdyenConfigured(env);
}

export function adyenEnvironment(env: NodeJS.ProcessEnv = process.env): "test" | "live" {
  const raw = env.ADYEN_ENVIRONMENT?.trim().toLowerCase();
  if (raw === "live" || raw === "production") return "live";
  return "test";
}

/**
 * Checkout API base URL.
 * Live requires `ADYEN_LIVE_ENDPOINT_PREFIX` (from Customer Area).
 */
export function adyenCheckoutApiBase(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.ADYEN_CHECKOUT_API_BASE?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (adyenEnvironment(env) === "live") {
    const prefix = env.ADYEN_LIVE_ENDPOINT_PREFIX?.trim();
    if (!prefix) {
      return "https://checkout-live.adyen.com/checkout";
    }
    return `https://${prefix}-checkout-live.adyenpayments.com/checkout`;
  }
  return "https://checkout-test.adyen.com";
}

export function adyenApiVersion(env: NodeJS.ProcessEnv = process.env): string {
  return env.ADYEN_CHECKOUT_API_VERSION?.trim() || "v71";
}

export function adyenMerchantAccount(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.ADYEN_MERCHANT_ACCOUNT?.trim() || undefined;
}

export function adyenApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.ADYEN_API_KEY?.trim() || undefined;
}

export function adyenHmacKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.ADYEN_HMAC_KEY?.trim() || undefined;
}

export function adyenClientKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.ADYEN_CLIENT_KEY?.trim() || undefined;
}
