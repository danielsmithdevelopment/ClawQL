import { isSelfServeCheckoutConfigured } from './self-serve-checkout'

export type BillingPeriod = 'Monthly' | 'Yearly'

/** Gateway + memory tiers (no IDP bundle). */
export type GatewayTierId = 'developer' | 'teams'

/** IDP plugin bundle tiers — document pipeline + VDR. */
export type IdpTierId = 'starter' | 'business' | 'professional'

export type ManagedTierId = GatewayTierId | IdpTierId

/** Comparison table columns — self-hosted plus all managed tiers. */
export const pricingPlanNames = ['Self-hosted', 'Developer', 'Teams', 'Starter', 'Business', 'Professional'] as const

export type PricingPlanName = (typeof pricingPlanNames)[number]

/** Customer-facing promise — no per-execution meter on hosted tiers (fair use until unit costs are measured). */
export const unlimitedExecutionsTagline =
  'No per-execution meter on hosted tiers — fair use until unit costs are measured on a real host.'

/** Hosted entry point — waitlist by default; Stripe Checkout copy when self-serve env is set. */
const hostedFreeTrialWaitlist = {
  durationDays: 14,
  headline: 'Request early access',
  subheadline:
    'Join the managed hosting waitlist for Developer-tier evaluation — persistent vault memory, no per-execution meter (fair use), managed MCP endpoint. Self-host free today while slots open. Early-access pricing is subject to change.',
  noCreditCard: true,
} as const

const hostedFreeTrialSelfServe = {
  durationDays: 14,
  headline: 'Start Pro with Stripe Checkout',
  subheadline:
    'Subscribe to managed Developer (Pro) hosting — persistent vault memory, no per-execution meter (fair use), managed MCP endpoint. Org provisions automatically after payment. Early-access pricing is subject to change.',
  noCreditCard: false,
} as const

export const hostedFreeTrial = isSelfServeCheckoutConfigured()
  ? hostedFreeTrialSelfServe
  : hostedFreeTrialWaitlist

/** Gateway-tier hosting benefits (customer-facing; no provider names). */
export const gatewayEdgeHostingFeature = 'Managed MCP endpoint (early access)'
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
      'search, execute, audit, cache, skills_list, skills_get — always-on Core. Managed hosting on gateway tiers. Unlimited integrations; no per-execution meter (fair use). Vault-backed memory with no per-recall egress penalties. Approvals, untrusted labels, vault credentials, and WORM audit included.',
    tiers: ['Developer', 'Teams'] as const,
  },
  memory: {
    name: 'Memory & Search',
    description: 'Obsidian vault, memory_ingest/recall, semantic search across your connected sources.',
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
    'Optional extras on any paid tier (included in Enterprise). Core governance — person-bound approvals, untrusted labels, vault credentials, Panguard ATR, Presidio redaction, and WORM audit — ships on every tier. This pack is for hardened runtime and reporting.',
  features: [
    'Kata Container VM isolation for agent workloads',
    'Model weight integrity verification (SHA-256 + Cosign)',
    'Monthly automated security posture report',
    'Dedicated isolation options when available',
  ],
} as const

export const pricing = {
  selfHosted: {
    name: 'Self-hosted',
    shortName: 'Self-hosted' as const,
    price: '$0',
    period: '',
    subheadline:
      'Self-host the Apache 2.0 packages in this repository — Helm chart, GHCR images, no license fee for those packages. Some network whitepaper packages remain private or BSL and are not on this path. Compose plugins via CLAWQL_INSTANCE_SPEC / CLAWQL_TIER (and CLAWQL_ENABLE_* when the instance allows). Provider catalog is empty by default.',
    features: [
      'search, execute, audit, cache, skills_* (Core — always on)',
      'memory_ingest & memory_recall (default on)',
      'Full IDP pipeline when you opt in (8 vendors)',
      'Apache 2.0 packages — you pay infra costs only',
      'Helm charts & GHCR images',
    ],
  },
  developer: {
    name: 'Developer',
    shortName: 'Developer' as const,
    monthlyPrice: '$29',
    annualPricePerMonth: '$24',
    period: '/mo',
    badge: 'Gateway + memory · early access · price TBD',
    pluginBundle: 'gateway' as const,
    valueAnchor:
      'Early-access managed gateway + vault memory — no per-execution meter (fair use). Price subject to change until unit costs are measured.',
    subheadline:
      'MCP gateway + agent memory vault for developers connecting Claude Code, Cursor, or Codex to your APIs. Request early access for managed hosting, or self-host free today. Early-access price subject to change.',
    features: [
      'No per-execution meter (fair use)',
      'Core governance included (approvals, labels, vault credentials, WORM audit)',
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
    badge: 'Gateway + memory + search · early access · price TBD',
    pluginBundle: 'memory' as const,
    valueAnchor: 'Agent infrastructure — semantic memory across connected tools without document processing.',
    subheadline:
      'Semantic search across your connected sources + memory vault + MCP gateway for teams building agent workflows. Add Starter when you need document processing. Early-access price subject to change.',
    features: [
      'No per-execution meter (fair use)',
      'Core governance included',
      gatewayEdgeHostingFeature,
      vaultRecallStorageFeature,
      singleMcpEndpointFeature,
      '5 users · unlimited integrations',
      'Semantic search across connected sources',
      'Obsidian vault + ingest_external_knowledge',
    ],
  },
  starter: {
    name: 'Starter',
    shortName: 'Starter' as const,
    monthlyPrice: '$299',
    annualPricePerMonth: '$249',
    period: '/mo',
    badge: 'IDP plugin bundle · early access · price TBD',
    pluginBundle: 'idp' as const,
    valueAnchor: 'Replaces DocSend + basic IDP — you opted into document processing explicitly.',
    subheadline:
      'Activates the IDP plugin bundle on tenant infrastructure: Tika, Gotenberg, Stirling, archive layer, classify/extract, Coneshare VDR, sovereign inference. Your MCP endpoint and vault memory stay the same. Early-access price subject to change.',
    features: [
      'No per-execution meter (fair use)',
      'Core governance included',
      'Tenant IDP pipeline',
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
    badge: 'IDP plugin bundle · early access · price TBD',
    pluginBundle: 'idp' as const,
    valueAnchor: 'Illustrative vs IDP + VDR + search stacks — verify incumbent quotes at procurement time.',
    subheadline:
      'Full IDP bundle + priority processing, cross-document semantic search, 25,000 documents/month, 99.5% SLA. Early-access price subject to change.',
    features: [
      'No per-execution meter (fair use)',
      'Core governance included',
      '25,000 documents/month',
      '25 users · 500 GB storage',
      'Coneshare VDR · full analytics',
      'Cross-document semantic search',
      'Email support (24 hr)',
    ],
  },
  professional: {
    name: 'Professional',
    shortName: 'Professional' as const,
    monthlyPrice: '$1,200',
    annualPricePerMonth: '$1,000',
    period: '/mo',
    badge: 'Full stack · early access · price TBD',
    pluginBundle: 'idp' as const,
    valueAnchor: 'Vertical deployments — lending, legal, real estate. One fine-tune adapter included.',
    subheadline:
      'Full IDP bundle + dedicated namespace (planned isolation tier), SSO/SAML, one vertical fine-tune adapter, 99.9% SLA. Early-access price subject to change.',
    features: [
      'No per-execution meter (fair use)',
      'Core governance included',
      '75,000 documents/month',
      'Unlimited users · 2 TB storage',
      'Dedicated namespace + priority queue (planned)',
      'One vertical fine-tune adapter',
      'SSO/SAML · Slack Connect · 99.9% SLA',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    priceFrom: '$3,500',
    period: '/mo',
    subheadline:
      'Large enterprises and regulated industries. Dedicated isolation (planned), custom fine-tune with retraining, multi-region (EU available), DPA/BAA, dedicated CSM. Sovereign Security Pack included. Early-access price subject to change.',
    features: [
      'Unlimited documents · custom storage',
      'Dedicated node isolation (planned)',
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
