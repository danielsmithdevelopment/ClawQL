export type BillingPeriod = 'Monthly' | 'Yearly'

export type ManagedTierId = 'starter' | 'business' | 'professional'

/** Comparison table columns — self-hosted plus managed tiers (June 2026 GTM, revised pricing). */
export const pricingPlanNames = ['Self-hosted', 'Free', 'Starter', 'Business', 'Professional'] as const

export type PricingPlanName = (typeof pricingPlanNames)[number]

/** Annual billing: ~2 months free on paid managed tiers. */
export const annualBillingSavingsLabel = '2 months free'

export const annualBillingTotals = {
  starter: '$2,988/yr',
  business: '$5,988/yr',
  professional: '$12,000/yr',
} as const

export const sovereignSecurityPack = {
  name: 'Sovereign Security Pack',
  monthlyPrice: '$200',
  period: '/mo',
  subheadline:
    'Optional on Starter, Business, and Professional. Included in Enterprise. Makes defense-in-depth controls visible and purchasable — Kata isolation, model weight verification, WORM Merkle audit logs, Panguard fail-closed ATR, and monthly posture reports.',
  features: [
    'Kata Container VM isolation for agent workloads',
    'Model weight integrity verification (SHA-256 + Cosign)',
    'WORM Merkle audit logs with signed Git commits',
    'Panguard ATR fail-closed enforcement',
    'Presidio pre-log redaction pipeline',
    'Monthly automated security posture report',
  ],
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
      'Real pipeline access — not a demo environment. Process documents through the full stack before committing. Coneshare VDR and sovereign inference not included.',
    features: [
      '200 documents/month',
      '1 user · 5 GB storage',
      'Full pipeline + Merkle audit',
      'Onyx semantic search (basic)',
      'Community support',
    ],
  },
  starter: {
    name: 'Starter',
    shortName: 'Starter' as const,
    monthlyPrice: '$299',
    annualPricePerMonth: '$249',
    period: '/mo',
    badge: 'Shared tenancy',
    valueAnchor: 'Replaces DocSend + basic IDP — DocSend alone runs $150–250/user/mo with no processing.',
    subheadline:
      'Small teams replacing DocSend and point OCR tools. Coneshare VDR, sovereign inference, and Obsidian vault included.',
    features: [
      '5,000 documents/month',
      '5 users · 50 GB storage',
      'Coneshare VDR + dynamic watermarking',
      'Sovereign LLM · Obsidian vault',
      'Email support (48 hr)',
    ],
  },
  business: {
    name: 'Business',
    shortName: 'Business' as const,
    monthlyPrice: '$599',
    annualPricePerMonth: '$499',
    period: '/mo',
    badge: 'Shared tenancy',
    valueAnchor: 'Equivalent incumbent stack: $3,000–6,000/mo across IDP + VDR + search.',
    subheadline:
      'Growing teams with real document volume and compliance awareness. Priority queue, full VDR analytics, 99.5% SLA.',
    features: [
      '25,000 documents/month',
      '25 users · 500 GB storage',
      'Coneshare VDR · full analytics',
      'Onyx cross-document search',
      'Email support (24 hr)',
    ],
  },
  professional: {
    name: 'Professional',
    shortName: 'Professional' as const,
    monthlyPrice: '$1,200',
    annualPricePerMonth: '$1,000',
    period: '/mo',
    badge: 'Dedicated namespace',
    valueAnchor: 'Vertical deployments — lending, legal, healthcare. One fine-tune adapter included.',
    subheadline:
      'Compliance-driven buyers needing a dedicated namespace, SSO/SAML, and a vertical fine-tune adapter trained on your document patterns.',
    features: [
      '75,000 documents/month',
      'Unlimited users · 2 TB storage',
      'Dedicated namespace + priority queue',
      'One vertical fine-tune adapter',
      'SSO/SAML · Slack Connect · 99.9% SLA',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    priceFrom: '$3,500',
    period: '/mo',
    subheadline:
      'Large enterprises and regulated industries. Dedicated node, custom fine-tune with ongoing retraining, multi-region (EU available), DPA/BAA, dedicated CSM. Sovereign Security Pack included.',
    features: [
      'Unlimited documents · custom storage',
      'Dedicated node (not just namespace)',
      'Custom vertical fine-tune + retraining',
      'EU multi-region · white-label Coneshare',
      'Sovereign Security Pack included',
      'Dedicated CSM & custom SLA',
    ],
  },
} as const

export function managedPrice(tier: ManagedTierId, billing: BillingPeriod): string {
  const t = pricing[tier]
  return billing === 'Monthly' ? t.monthlyPrice : t.annualPricePerMonth
}

export function annualBillingNoteText(billing: BillingPeriod): string | null {
  if (billing !== 'Yearly') return null
  return ` Billed annually (${annualBillingTotals.starter} Starter · ${annualBillingTotals.business} Business · ${annualBillingTotals.professional} Professional) — ${annualBillingSavingsLabel} vs monthly billing.`
}

/** Business tier all-in max with optional Sovereign Security Pack. */
export const businessAllInMonthly = '$799'
