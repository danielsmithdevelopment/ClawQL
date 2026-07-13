import type { MppPaymentOffer } from "./types.js";
import { MPP_METHOD_STRIPE, MPP_METHOD_X402 } from "./types.js";

/** Known traditional-finance MPP method identifiers (extensible via env). */
export const MPP_FINANCE_METHOD_PAYPAL = "paypal" as const;
export const MPP_FINANCE_METHOD_ADYEN = "adyen" as const;
export const MPP_FINANCE_METHOD_SQUARE = "square" as const;

export type MppFinanceMethod =
  | typeof MPP_FINANCE_METHOD_PAYPAL
  | typeof MPP_FINANCE_METHOD_ADYEN
  | typeof MPP_FINANCE_METHOD_SQUARE
  | string;

const DEFAULT_FINANCE_METHODS: MppFinanceMethod[] = [];

export function parseFinanceProviderList(raw: string | undefined): MppFinanceMethod[] {
  if (!raw?.trim()) return DEFAULT_FINANCE_METHODS;
  return raw
    .split(/[,\s]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export function financeProvidersFromEnv(env: NodeJS.ProcessEnv = process.env): MppFinanceMethod[] {
  return parseFinanceProviderList(env.CLAWQL_MPP_FINANCE_PROVIDERS);
}

export function buildFinanceOffer(input: {
  method: MppFinanceMethod;
  description?: string;
  metered?: boolean;
}): MppPaymentOffer {
  return {
    intent: "charge",
    method: input.method,
    amount: null,
    currency: "usd",
    description:
      input.description ?? `${input.method} billing — configure credentials on self-hosted ClawQL.`,
  };
}

export function appendFinanceOffers(input: {
  offers: MppPaymentOffer[];
  env?: NodeJS.ProcessEnv;
  resource?: string;
}): MppPaymentOffer[] {
  const env = input.env ?? process.env;
  const stripeEnabled = Boolean(env.STRIPE_SECRET_KEY?.trim());
  const providers = financeProvidersFromEnv(env);
  if (providers.length === 0) return input.offers;

  const existing = new Set(input.offers.map((o) => o.method));
  const appended = [...input.offers];
  for (const method of providers) {
    if (method === MPP_METHOD_STRIPE || method === MPP_METHOD_X402) continue;
    if (existing.has(method)) continue;
    appended.push(
      buildFinanceOffer({
        method,
        description: input.resource ? `${method} billing for ${input.resource}` : undefined,
        metered: !stripeEnabled,
      })
    );
    existing.add(method);
  }
  return appended;
}
