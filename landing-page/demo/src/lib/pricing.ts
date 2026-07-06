export type BillingPeriod = 'Monthly' | 'Yearly'

/** Gateway + memory tiers (no IDP bundle). */
export type GatewayTierId = 'developer' | 'teams'

/** IDP plugin bundle tiers — document pipeline + VDR. */
export type IdpTierId = 'starter' | 'business' | 'professional'

export type ManagedTierId = GatewayTierId | IdpTierId

/** Comparison table columns — self-hosted plus all managed tiers. */
export const pricingPlanNames = [
  'Self-hosted',
  'Free',
  'Developer',
  'Teams',
  'Starter',
  'Business',
  'Professional',
] as const

export type PricingPlanName = (typeof pricingPlanNames)[number]

/** Execution overage — matches Executor.sh (July 2026). */
export const executionOveragePerThousand = '$0.20'

/** Annual billing: ~2 months free on paid managed tiers. */
export const annualBillingSavingsLabel = '2 months free'

export const annualBillingTotals = {
  developer: '$290/yr',
  teams: '$990/yr',
  starter: '$2,988/yr',
  business: '$5,988/yr',
  professional: '$12,000/yr',
} as const

export const pluginBundles = {
  gateway: {
    name: 'MCP Gateway',
    description: 'search, execute, audit, cache — always-on Core. Unlimited integrations.',
    tiers: ['Free', 'Developer', 'Teams'] as const,
  },
  memory: {
    name: 'Memory & Search',
    description: 'Obsidian vault, memory_ingest/recall, Onyx semantic search over your indexed data.',
    tiers: ['Developer', 'Teams'] as const,
  },
  idp: {
    name: 'IDP Plugin Bundle',
    description: 'Tika, Gotenberg, Stirling, archive layer, classify/extract, Coneshare VDR, sovereign inference.',
    tiers: ['Starter', 'Business', 'Professional'] as const,
  },
} as const

export const sovereignSecurityPack = {
  name: 'Sovereign Security Pack',
  monthlyPrice: '$200',
  period: '/mo',
  subheadline:
    'Optional on any paid tier. Included in Enterprise. Kata isolation, model weight verification, WORM Merkle audit logs, Panguard fail-closed ATR, and monthly posture reports.',
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
    subheadline: 'Run the full open-source stack on your hardware — enable only the plugins you need via CLAWQL_ENABLE_* flags.',
    features: [
      'search, execute, audit, cache (Core — always on)',
      'memory_ingest & memory_recall (default on)',
      'Full IDP pipeline when you opt in (8 vendors)',
      'Helm charts & GHCR images',
      'No license fee — you pay infra only',
    ],
  },
  managedFree: {
    name: 'Free',
    shortName: 'Free' as const,
    monthlyPrice: '$0',
    period: '/mo',
    badge: 'Gateway · early access',
    pluginBundle: 'gateway' as const,
    subheadline:
      'Try the hosted MCP gateway — connect agents to your APIs without IDP or VDR overhead. Memory vault included at evaluation scale.',
    features: [
      '10,000 executions/month',
      '1 user · 3 integrations',
      'Core MCP + basic memory vault',
      'No IDP pipeline · no Coneshare VDR',
      'Community support',
    ],
  },
  developer: {
    name: 'Developer',
    shortName: 'Developer' as const,
    monthlyPrice: '$29',
    annualPricePerMonth: '$24',
    period: '/mo',
    badge: 'Gateway + memory',
    pluginBundle: 'gateway' as const,
    valueAnchor: 'Executor Team is $150/org — ClawQL adds durable vault memory they do not ship.',
    subheadline:
      'MCP gateway + agent memory vault for developers connecting Claude Code, Cursor, or Codex to your APIs. No IDP, no GPU inference.',
    features: [
      '50,000 executions/month',
      '3 users · unlimited integrations',
      'memory_ingest & memory_recall vault',
      `Overage ${executionOveragePerThousand}/1,000 executions`,
      'Email support (72 hr)',
    ],
  },
  teams: {
    name: 'Teams',
    shortName: 'Teams' as const,
    monthlyPrice: '$99',
    annualPricePerMonth: '$82',
    period: '/mo',
    badge: 'Gateway + memory + search',
    pluginBundle: 'memory' as const,
    valueAnchor: 'Agent infrastructure — semantic memory across connected tools without document processing.',
    subheadline:
      'Full Onyx semantic search + memory vault + MCP gateway for teams building agent workflows. Still no IDP bundle — add Starter when you need document processing.',
    features: [
      '250,000 executions/month',
      '10 users · unlimited integrations',
      'Full Onyx semantic search',
      'Obsidian vault + ingest_external_knowledge',
      `Overage ${executionOveragePerThousand}/1,000 executions`,
    ],
  },
  starter: {
    name: 'Starter',
    shortName: 'Starter' as const,
    monthlyPrice: '$299',
    annualPricePerMonth: '$249',
    period: '/mo',
    badge: 'IDP plugin bundle',
    pluginBundle: 'idp' as const,
    valueAnchor: 'Replaces DocSend + basic IDP — you opted into document processing explicitly.',
    subheadline:
      'Activates the IDP plugin bundle: Tika, Gotenberg, Stirling, archive layer, classify/extract, Coneshare VDR, sovereign inference.',
    features: [
      '5,000 documents/month',
      '5 users · 50 GB storage',
      'Coneshare VDR + dynamic watermarking',
      'Sovereign LLM · full IDP pipeline',
      'Email support (48 hr)',
    ],
  },
  business: {
    name: 'Business',
    shortName: 'Business' as const,
    monthlyPrice: '$599',
    annualPricePerMonth: '$499',
    period: '/mo',
    badge: 'IDP plugin bundle',
    pluginBundle: 'idp' as const,
    valueAnchor: 'Equivalent incumbent stack: $3,000–6,000/mo across IDP + VDR + search.',
    subheadline:
      'Full IDP bundle + priority processing, enhanced Onyx, 25,000 documents/month, 99.5% SLA.',
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
    badge: 'Full stack',
    pluginBundle: 'idp' as const,
    valueAnchor: 'Vertical deployments — lending, legal, real estate. One fine-tune adapter included.',
    subheadline:
      'Full IDP bundle + dedicated namespace, SSO/SAML, one vertical fine-tune adapter, 99.9% SLA.',
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
      'Large enterprises and regulated industries. Dedicated node, custom fine-tune with retraining, multi-region (EU available), DPA/BAA, dedicated CSM. Sovereign Security Pack included.',
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

export function annualBillingNoteText(billing: BillingPeriod, tier: ManagedTierId): string | null {
  if (billing !== 'Yearly') return null
  const total = annualBillingTotals[tier]
  return ` Billed annually (${total}) — ${annualBillingSavingsLabel} vs monthly billing.`
}

/** Business tier all-in max with optional Sovereign Security Pack. */
export const businessAllInMonthly = '$799'
