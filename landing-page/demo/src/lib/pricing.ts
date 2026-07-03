export type BillingPeriod = 'Monthly' | 'Yearly'

export const pricingPlanNames = ['Self-hosted', 'Shared', 'Dedicated'] as const

export const pricing = {
  selfHosted: {
    name: 'Self-hosted',
    price: '$0',
    period: '',
    subheadline: 'Run ClawQL on your own hardware — full open-source stack, no license fee.',
    features: [
      'search, execute, audit, cache',
      'memory_ingest & memory_recall',
      'Full IDP pipeline (8 vendors)',
      'ingest_external_knowledge',
      'Helm charts & GHCR images',
    ],
  },
  shared: {
    name: 'Shared hosting',
    shortName: 'Shared',
    monthlyPrice: '$299',
    annualPricePerMonth: '$250',
    period: '/mo',
    badge: 'Multi-tenant',
    subheadline:
      'Hosted MCP, vault, and IDP on shared infrastructure. Cost-effective — may see reduced performance during burst periods and is not fully isolated for strict compliance regimes.',
    features: [
      'Everything in Self-hosted',
      'Hosted MCP endpoint',
      'Vault-backed memory',
      'Managed IDP (8 vendors)',
      'knowledge_search_onyx',
      'Email support',
    ],
  },
  dedicated: {
    name: 'Dedicated hosting',
    shortName: 'Dedicated',
    monthlyPrice: '$599',
    annualPricePerMonth: '$500',
    period: '/mo',
    badge: 'Single-tenant',
    subheadline:
      'Your own isolated hardware — no other customers on the cluster. Full data and compute isolation for regulators and compliance-sensitive workloads.',
    features: [
      'Everything in Shared',
      'Dedicated infrastructure',
      'No multi-tenant neighbors',
      'Predictable performance',
      'SSO and RBAC',
      'Priority email support',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    subheadline:
      'Very high volume, custom SLAs, and on-call support. Contracts are tailored — typically starting around $3,000/month. Contact us to scope your requirements.',
    features: [
      'Everything in Dedicated',
      'Custom usage limits',
      'Dedicated SLA',
      'On-call support',
      'hitl_enqueue_label_studio',
      'Security review assistance',
    ],
  },
} as const

export function managedPrice(tier: 'shared' | 'dedicated', billing: BillingPeriod): string {
  const t = pricing[tier]
  return billing === 'Monthly' ? t.monthlyPrice : t.annualPricePerMonth
}
