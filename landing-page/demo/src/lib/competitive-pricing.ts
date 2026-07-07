/** Competitive landscape benchmarks — June 2026 GTM playbook. Illustrative; verify at procurement time. */

import { businessAllInMonthly, pricing, unlimitedExecutionsTagline } from './pricing'

export const competitiveHeadline = 'Gateway, memory, and IDP — price each plugin bundle against the right incumbent.'

export const competitiveSummary =
  'ClawQL is not one product at one price. Developer and Teams tiers replace stateless MCP routers like executor.sh with a global edge gateway, persistent vault memory (no egress penalties on recall), Onyx semantic search, eight compounding token-efficiency layers, and unlimited executions — no meter, no overage. Starter through Professional compete with IDP and VDR incumbents on document volume — a $8,000–15,000/month stack sold separately elsewhere.'

/** MCP gateway competitor — executor.sh (direct competitor to ClawQL gateway layer). */
export const executorBenchmark = {
  name: 'executor.sh',
  href: 'https://executor.sh/',
  positioning:
    'Stateless MCP tool router. Normalizes OpenAPI/GraphQL/MCP into a search-and-execute gateway with host-side secret injection and basic audit logging. That is the complete product.',
  pricing: [
    { tier: 'Free', price: '$0', includes: '3 members · 10,000 executions/mo cap' },
    {
      tier: 'Team',
      price: '$150/org/mo',
      includes: '250,000 executions/mo cap · $0.20/1,000 overage · basic audit log only',
    },
    { tier: 'ClawQL', price: 'All tiers', includes: unlimitedExecutionsTagline },
  ],
  clawqlResponse: {
    tiers: `Developer ${pricing.developer.monthlyPrice}/mo · Teams ${pricing.teams.monthlyPrice}/mo`,
    advantage:
      'ClawQL implements the same Layer 1 search/execute pattern, then compounds seven additional efficiency layers on top — plus persistent Obsidian vault memory, Onyx semantic search, and an optional full IDP platform. executor.sh stops at Layer 1.',
    closing:
      'executor.sh is a stateless tool router. ClawQL is a stateful agent operating system. This is not a close comparison.',
  },
} as const

export type ExecutorComparisonRow = {
  dimension: string
  executor: string
  clawql: string
}

/** Dimension-by-dimension comparison — Market 1 (MCP Gateway) from GTM playbook. */
export const executorComparisonRows: ExecutorComparisonRow[] = [
  {
    dimension: 'Token efficiency architecture',
    executor: 'One layer: search-and-execute pattern only.',
    clawql:
      'Eight compounding layers — response trimming, prose compression, prompt caching, semantic cache, history compression, final prompt trimming, and model routing on top of search/execute.',
  },
  {
    dimension: 'Agent memory',
    executor: 'None. No cross-session memory, no vault, no memory_recall.',
    clawql:
      'Built-in Obsidian vault — agents recall architectural decisions from prior sessions. No egress penalties on memory recall.',
  },
  {
    dimension: 'Semantic search',
    executor: 'None.',
    clawql: 'Onyx enterprise search — 40+ connectors, hybrid keyword + vector, citation-backed results.',
  },
  {
    dimension: 'Security architecture',
    executor: 'Host-side secret injection and basic audit log. No public defense-in-depth documentation.',
    clawql:
      'Kata VM isolation, WORM Merkle audit logs, Panguard fail-closed ATR, model weight integrity verification, Presidio pre-log redaction — documented at docs.clawql.com/security/defense-in-depth.',
  },
  {
    dimension: 'Document processing pipeline',
    executor: 'None.',
    clawql: 'Full IDP — Tika, Gotenberg, Stirling-PDF, archive layer, Merkle audit per step.',
  },
  {
    dimension: 'Virtual data room',
    executor: 'None.',
    clawql: 'Coneshare VDR included from IDP Starter tier — trackable links, engagement analytics, watermarking.',
  },
  {
    dimension: 'Sovereign LLM inference',
    executor: 'None. All inference routes to external APIs.',
    clawql: 'Fine-tuned Qwen3.6-27B inside tenant boundary — Istio egress block, no tokens leave the namespace.',
  },
  {
    dimension: 'Execution pricing',
    executor: '250,000 cap on Team + $0.20/1,000 overage. Customers watch a meter and throttle agents.',
    clawql: 'Unlimited executions on every tier. No caps, no overage bills, no egress tax on vault recall.',
  },
  {
    dimension: 'Pricing (gateway-only)',
    executor: 'Team $150/org/mo — metered executions, no memory or search.',
    clawql: `Developer ${pricing.developer.monthlyPrice}/mo with vault memory; Teams ${pricing.teams.monthlyPrice}/mo adds Onyx search. IDP from ${pricing.starter.monthlyPrice}/mo. All unlimited executions.`,
  },
]

export const tcoBenchmarks = [
  {
    label: 'vs executor.sh (MCP gateway)',
    scenario: 'Team connecting Cursor to GitHub, Stripe, Jira — heavy daily agent usage',
    incumbent: 'executor.sh Team: $150/org/mo + $0.20/1,000 overage — pay more as agents work harder',
    clawql: `Teams: ${pricing.teams.monthlyPrice}/mo — unlimited executions, edge-hosted gateway, vault memory, Onyx search`,
    note: 'No execution meter, no egress tax on vault recall. executor.sh meters executions and bills overage.',
  },
  {
    label: 'vs Hyperscience (IDP)',
    scenario: 'Business tier: 25,000 documents/mo × ~5 pages = 125,000 pages',
    incumbent: '~$1.50/page → ~$187,500/mo',
    clawql: `Business (IDP bundle): ${pricing.business.monthlyPrice}/mo flat`,
    note: 'Volume-based IDP pricing scales linearly with every page processed.',
  },
  {
    label: 'vs VDR incumbents',
    scenario: 'Starter IDP bundle with Coneshare VDR included',
    incumbent: 'Intralinks/Datasite: $10K–$200K+/yr; Ansarada ~$3,069/mo for 5 GB',
    clawql: `Starter: ${pricing.starter.monthlyPrice}/mo ($3,588/yr)`,
    note: 'Legacy VDR adds storage overages ($100–$300/GB), per-seat fees, and setup charges.',
  },
] as const

/** Real estate vertical — brokerage CRM + Drive disconnect. */
export const realEstateVertical = {
  headline: 'Real estate: CRM knows the deal, Drive holds the files',
  problem:
    'Keller Williams Command, eXp BoldTrail, Follow Up Boss, and Compass track contacts and pipeline — but Google Drive folders do not classify title commitments, extract offer contingencies, or link documents back to the deal record. Coordinators re-read PDFs; FSBO sellers compare offers manually.',
  clawqlPitch:
    'Teams tier ($99/mo): MCP gateway connects Command API + Google Drive; Onyx indexes transaction folders semantically; vault memory threads deal context across sessions. Add IDP Starter ($299/mo) when you need classify/extract on title commitments and PSAs, or Coneshare VDR for trackable disclosure packages instead of ad-hoc Drive links.',
  competitors: [
    {
      name: 'REsimpli',
      pricing: 'Basic $149/mo · Pro $299/mo · Enterprise $599/mo',
      gap: 'CRM-only for real estate investors — no MCP gateway, no semantic document layer, no VDR pipeline integration.',
    },
    {
      name: 'Dotloop / SkySlope',
      pricing: 'Per-agent transaction fees',
      gap: 'Forms, e-sign, broker compliance — not document intelligence or cross-deal memory. Complementary, not competitive.',
    },
  ],
  recommendedTier: `Teams ${pricing.teams.monthlyPrice}/mo for agent memory + unified search; IDP Starter when document processing is required.`,
  href: '/industries/real-estate',
} as const

export const stackReplacementSummary = {
  headline: 'Full stack replacement cost (Business-tier IDP customer)',
  profile: '25 users · 25,000 documents/month · VDR sharing with external parties',
  incumbentRange: '$8,000–15,000+/month',
  incumbentDetail:
    'executor.sh + ABBYY + Intralinks + Glean + compliance tooling — separate contracts, separate data exposure points, no unified audit trail.',
  clawqlBusiness: `${pricing.business.monthlyPrice}/month`,
  clawqlBusinessMax: `${businessAllInMonthly}/month with Sovereign Security Pack`,
  savingsNote:
    '10–19× below incumbent stack at comparable capability, with sovereign inference and zero external LLM API calls.',
} as const

export type CompetitorColumn = 'ClawQL Business' | 'Hyperscience' | 'ABBYY Vantage' | 'Intralinks / Datasite'

export type CompetitorFeatureRow = {
  feature: string
  values: Record<CompetitorColumn, string | boolean>
  footnote?: string
}

export const competitorColumns: CompetitorColumn[] = [
  'ClawQL Business',
  'Hyperscience',
  'ABBYY Vantage',
  'Intralinks / Datasite',
]

/** Feature comparison vs IDP and VDR incumbents — Business tier ($599/mo) as ClawQL reference. */
export const competitorFeatureRows: CompetitorFeatureRow[] = [
  {
    feature: 'Document parsing (1,000+ formats)',
    values: { 'ClawQL Business': true, Hyperscience: true, 'ABBYY Vantage': true, 'Intralinks / Datasite': false },
  },
  {
    feature: 'OCR',
    values: { 'ClawQL Business': true, Hyperscience: true, 'ABBYY Vantage': true, 'Intralinks / Datasite': false },
  },
  {
    feature: 'PII redaction',
    values: {
      'ClawQL Business': true,
      Hyperscience: 'Partial',
      'ABBYY Vantage': true,
      'Intralinks / Datasite': 'Add-on',
    },
  },
  {
    feature: 'Merkle cryptographic audit trail',
    values: { 'ClawQL Business': true, Hyperscience: false, 'ABBYY Vantage': false, 'Intralinks / Datasite': false },
  },
  {
    feature: 'Semantic search (Onyx)',
    values: { 'ClawQL Business': true, Hyperscience: false, 'ABBYY Vantage': false, 'Intralinks / Datasite': false },
  },
  {
    feature: 'AI agent orchestration (MCP)',
    values: { 'ClawQL Business': true, Hyperscience: false, 'ABBYY Vantage': false, 'Intralinks / Datasite': false },
  },
  {
    feature: 'Agent memory vault (Obsidian)',
    values: { 'ClawQL Business': true, Hyperscience: false, 'ABBYY Vantage': false, 'Intralinks / Datasite': false },
  },
  {
    feature: 'Virtual data room (Coneshare)',
    values: { 'ClawQL Business': true, Hyperscience: false, 'ABBYY Vantage': false, 'Intralinks / Datasite': true },
  },
  {
    feature: 'Local / sovereign LLM inference',
    values: { 'ClawQL Business': true, Hyperscience: false, 'ABBYY Vantage': false, 'Intralinks / Datasite': false },
  },
  {
    feature: 'Self-hosted option',
    values: { 'ClawQL Business': true, Hyperscience: 'Partial', 'ABBYY Vantage': true, 'Intralinks / Datasite': false },
  },
  {
    feature: 'Pre-trained document skills library',
    values: {
      'ClawQL Business': 'Vertical adapters (Professional+)',
      Hyperscience: 'Extensive',
      'ABBYY Vantage': '150+ skills',
      'Intralinks / Datasite': false,
    },
    footnote:
      'ABBYY ships broad pre-built skills day one. ClawQL Professional includes one vertical fine-tune adapter; Enterprise adds custom retraining.',
  },
  {
    feature: 'Pricing model',
    values: {
      'ClawQL Business': '$599/mo flat (IDP bundle)',
      Hyperscience: '~$0.50–$1.50/page',
      'ABBYY Vantage': '$40K–$100K+/yr',
      'Intralinks / Datasite': '$10K–$200K+/yr',
    },
  },
]

export const competitiveHonestyNotes = [
  {
    title: 'Unlimited executions — deliberate pricing',
    body: 'Gateway tiers run at the global edge and scale with demand — an extra execution or memory_recall costs us almost nothing in egress. Charging per execution creates a perverse incentive to throttle agents. ClawQL prices on hosting model, storage, and plugin bundles. Unlimited executions on every tier, including Free. executor.sh caps usage and bills $0.20/1,000 overage.',
  },
  {
    title: 'Plugin bundles, not one-size-fits-all',
    body: 'Gateway-only buyers should not pay for Stirling, Gotenberg, and GPU inference. Developer ($29) and Teams ($99) replace executor.sh for pure API routing — with memory, search, and unlimited executions executor.sh cannot match. IDP tiers ($299+) are explicitly opted-in document processing — priced against Hyperscience and Intralinks.',
  },
  {
    title: 'executor.sh vs ClawQL (MCP gateway)',
    body: 'executor.sh implements one token-efficiency layer and routes tool calls behind a usage meter. ClawQL compounds eight efficiency layers, ships a global edge gateway, persistent vault memory without egress penalties on recall, Onyx semantic search, unlimited executions, and an optional full IDP platform. executor.sh has no equivalent at any price point beyond Layer 1 routing.',
  },
  {
    title: 'Where incumbents still lead',
    body: 'ABBYY Vantage ships 150+ pre-trained skills for common document types. ClawQL Professional includes one vertical fine-tune adapter; building the full library takes time. We state this openly in competitive evaluations rather than overclaiming day-one parity.',
  },
] as const
