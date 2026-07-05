export type BillingPeriod = 'Monthly' | 'Yearly'

export type ManagedTierId = 'starter' | 'business' | 'dedicated'

/** Comparison table columns — self-hosted plus managed tiers from the GTM playbook. */
export const pricingPlanNames = ['Self-hosted', 'Free', 'Starter', 'Business', 'Dedicated'] as const

export type PricingPlanName = (typeof pricingPlanNames)[number]

/** Annual billing: ~2 months free on paid managed tiers. */
export const annualBillingSavingsLabel = '2 months free'

export const annualBillingTotals = {
  starter: '$1,488/yr',
  business: '$2,988/yr',
  dedicated: '$5,988/yr',
} as const

export const pricing = {
  selfHosted: {
    name: 'Self-hosted',
    shortName: 'Self-hosted' as const,
    price: '$0',
    period: '',
    subheadline: 'Run the full open-source stack on your hardware — no license fee, no document caps enforced by us.',
    features: [
      'search, execute, audit, cache',
      'memory_ingest & memory_recall',
      'Full IDP pipeline (8 vendors)',
      'ingest_external_knowledge',
      'Helm charts & GHCR images',
    ],
  },
  managedFree: {
    name: 'Free',
    shortName: 'Free' as const,
    monthlyPrice: '$0',
    period: '/mo',
    badge: 'Managed · early access',
    subheadline:
      'Try the real hosted pipeline — Tika, Gotenberg, Stirling, archive, and Onyx basic — with usage limits. Coneshare VDR not included.',
    features: [
      '500 documents/month',
      '1 user · 5 GB storage',
      'Hosted MCP + IDP pipeline',
      'Onyx semantic search (basic)',
      'Community support',
    ],
  },
  starter: {
    name: 'Starter',
    shortName: 'Starter' as const,
    monthlyPrice: '$149',
    annualPricePerMonth: '$124',
    period: '/mo',
    badge: 'Shared tenancy',
    subheadline:
      'Multi-tenant managed hosting for teams processing contracts, invoices, or compliance docs — Coneshare VDR included.',
    features: [
      '5,000 documents/month',
      '5 users · 50 GB storage',
      'Coneshare VDR',
      'Full Onyx semantic search',
      'Email support (48 hr)',
    ],
  },
  business: {
    name: 'Business',
    shortName: 'Business' as const,
    monthlyPrice: '$299',
    annualPricePerMonth: '$249',
    period: '/mo',
    badge: 'Shared tenancy',
    subheadline:
      'Higher document volume and priority processing for growing teams — still multi-tenant, with 99.5% uptime SLA.',
    features: [
      '25,000 documents/month',
      '25 users · 500 GB storage',
      'Coneshare VDR + priority queue',
      'Full Onyx semantic search',
      'Email support (24 hr)',
    ],
  },
  dedicated: {
    name: 'Dedicated',
    shortName: 'Dedicated' as const,
    monthlyPrice: '$599',
    annualPricePerMonth: '$499',
    period: '/mo',
    badge: 'Single-tenant',
    subheadline:
      'Dedicated namespace with full node resource allocation — no neighbor tenants. Sovereign inference; unlimited documents.',
    features: [
      'Unlimited documents',
      'Unlimited users · 1 TB storage',
      'Coneshare VDR + analytics',
      '99.9% uptime SLA',
      'Priority email + Slack connect',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    subheadline:
      'Custom annual contracts for EU data residency, SSO/SAML, on-call support, and very high volume. Scoped individually — contact sales.',
    features: [
      'Everything in Dedicated',
      'SSO / SAML',
      'EU data residency (roadmap)',
      'hitl_enqueue_label_studio',
      'Dedicated CSM & custom SLA',
      'Security review assistance',
    ],
  },
} as const

export function managedPrice(tier: ManagedTierId, billing: BillingPeriod): string {
  const t = pricing[tier]
  return billing === 'Monthly' ? t.monthlyPrice : t.annualPricePerMonth
}

export function annualBillingNoteText(billing: BillingPeriod): string | null {
  if (billing !== 'Yearly') return null
  return ` Billed annually (${annualBillingTotals.starter} Starter · ${annualBillingTotals.business} Business · ${annualBillingTotals.dedicated} Dedicated) — ${annualBillingSavingsLabel} vs monthly billing.`
}
