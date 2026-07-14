export type BillingPeriod = 'Monthly' | 'Yearly'

/** Gateway + memory tiers (no IDP bundle). */
export type GatewayTierId = 'developer' | 'teams'

/** IDP plugin bundle tiers — document pipeline + VDR. */
export type IdpTierId = 'starter' | 'business' | 'professional'

export type ManagedTierId = GatewayTierId | IdpTierId

/** Comparison table columns — self-hosted plus all managed tiers. */
export const pricingPlanNames = ['Self-hosted', 'Developer', 'Teams', 'Starter', 'Business', 'Professional'] as const

export type PricingPlanName = (typeof pricingPlanNames)[number]

/** Customer-facing promise — no execution caps or overage on hosted tiers. */
export const unlimitedExecutionsTagline =
  'Unlimited MCP executions on every hosted tier — no caps, no overage, no meter.'

/** Hosted entry point — full Developer tier evaluation, no perpetual free hosted plan. */
export const hostedFreeTrial = {
  durationDays: 14,
  headline: '14-day free trial',
  subheadline:
    'Full Developer tier — persistent vault memory, unlimited executions, global edge endpoint. No credit card required.',
  noCreditCard: true,
} as const

/** Gateway-tier hosting benefits (customer-facing; no provider names). */
export const gatewayEdgeHostingFeature = 'Global edge-hosted MCP endpoint'
export const vaultRecallStorageFeature = 'Vault storage — no egress penalties on memory recall'
export const singleMcpEndpointFeature = 'One MCP endpoint on every tier — same URL when you upgrade'

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
    description:
      'search, execute, audit, cache — always-on Core. Global edge hosting on gateway tiers. Unlimited integrations and executions. Vault-backed memory with no per-recall egress penalties.',
    tiers: ['Developer', 'Teams'] as const,
  },
  memory: {
    name: 'Memory & Search',
    description: 'Obsidian vault, memory_ingest/recall, Onyx semantic search over your indexed data.',
    tiers: ['Developer', 'Teams'] as const,
  },
  idp: {
    name: 'IDP Plugin Bundle',
    description:
      'Opt-in dedicated document-processing infrastructure — Tika, Gotenberg, Stirling, archive layer, classify/extract, Coneshare VDR, sovereign inference. Provisions when you activate Starter or above.',
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
    subheadline:
      'Want free forever? Run the full Apache 2.0 stack on your hardware — Helm chart, GHCR images, no license fee, no feature restrictions. Enable only the plugins you need via CLAWQL_ENABLE_* flags.',
    features: [
      'search, execute, audit, cache (Core — always on)',
      'memory_ingest & memory_recall (default on)',
      'Full IDP pipeline when you opt in (8 vendors)',
      'Apache 2.0 — free forever, you pay infra only',
      'Helm charts & GHCR images',
    ],
  },
  developer: {
    name: 'Developer',
    shortName: 'Developer' as const,
    monthlyPrice: '$29',
    annualPricePerMonth: '$24',
    period: '/mo',
    badge: 'Gateway + memory · 14-day trial',
    pluginBundle: 'gateway' as const,
    valueAnchor:
      'Unlimited executions + vault memory + twelve efficiency layers — executor.sh caps usage and charges overage.',
    subheadline:
      'MCP gateway + agent memory vault for developers connecting Claude Code, Cursor, or Codex to your APIs. Start with a 14-day free trial — no credit card. No IDP, no GPU inference.',
    features: [
      'Unlimited MCP executions',
      gatewayEdgeHostingFeature,
      vaultRecallStorageFeature,
      singleMcpEndpointFeature,
      '1 user · unlimited integrations',
      'memory_ingest & memory_recall vault',
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
      'Unlimited MCP executions',
      gatewayEdgeHostingFeature,
      vaultRecallStorageFeature,
      singleMcpEndpointFeature,
      '5 users · unlimited integrations',
      'Full Onyx semantic search',
      'Obsidian vault + ingest_external_knowledge',
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
      'Activates the IDP plugin bundle on dedicated tenant infrastructure: Tika, Gotenberg, Stirling, archive layer, classify/extract, Coneshare VDR, sovereign inference. Your MCP endpoint and vault memory stay the same.',
    features: [
      'Unlimited MCP executions',
      'Dedicated tenant · full IDP pipeline',
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
    subheadline: 'Full IDP bundle + priority processing, enhanced Onyx, 25,000 documents/month, 99.5% SLA.',
    features: [
      'Unlimited MCP executions',
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
    subheadline: 'Full IDP bundle + dedicated namespace, SSO/SAML, one vertical fine-tune adapter, 99.9% SLA.',
    features: [
      'Unlimited MCP executions',
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
