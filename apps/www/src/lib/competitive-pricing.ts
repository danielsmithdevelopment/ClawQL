/** Competitive landscape benchmarks — June 2026 GTM playbook. Illustrative; verify at procurement time. */

import { businessAllInMonthly, pricing, unlimitedExecutionsTagline } from './pricing'

export const competitiveHeadline = 'Plugin bundles — price each layer against the right incumbent.'

export const competitiveSummary =
  'ClawQL is an operating system for agents. Developer and Teams tiers replace stateless MCP routers like executor.sh with a global edge gateway, persistent vault memory, Onyx semantic search, compounding token-efficiency layers, and unlimited executions. Starter through Professional compete with IDP and VDR incumbents — only when you opt into document processing. Gateway buyers pay for gateway; document processing activates separately.'

/** MCP gateway competitor — executor.sh (direct competitor to ClawQL gateway layer). */
export const executorBenchmark = {
  name: 'executor.sh',
  href: 'https://executor.sh/',
  positioning:
    'executor.sh normalizes OpenAPI/GraphQL/MCP into a search-and-execute gateway with host-side secret injection and audit logging. Product surface evolves — verify current Executor docs at procurement time; equal-arm measurements live on /benchmarks.',
  pricing: [
    { tier: 'Free', price: '$0', includes: '3 members · 10,000 executions/mo cap' },
    {
      tier: 'Team',
      price: '$150/org/mo',
      includes: 'Metered Team plan (caps/overage historically published — re-verify against Executor 2; see /benchmarks footnotes)',
    },
    { tier: 'ClawQL', price: 'All tiers', includes: unlimitedExecutionsTagline },
  ],
  clawqlResponse: {
    tiers: `Developer ${pricing.developer.monthlyPrice}/mo · Teams ${pricing.teams.monthlyPrice}/mo`,
    advantage:
      'executor.sh routes tool calls well. ClawQL covers the same Layer 1 search/execute pattern and adds compounding token-efficiency layers (shipped and planned — see inference docs), persistent vault memory, Onyx semantic search, defense-in-depth security, and an optional full IDP platform behind one MCP endpoint.',
    closing:
      'executor.sh has real advantages in developer mindshare and go-to-market velocity — YC backing, community growth, and brand recognition in the MCP gateway category. On memory, security architecture, token efficiency, document pipeline, and sovereign inference, ClawQL is a different category of product.',
  },
} as const

export type ExecutorComparisonRow = {
  dimension: string
  executor: string
  clawql: string
}

/** Dimension-by-dimension comparison — Market 1 (MCP gateway) from GTM playbook. */
export const executorComparisonRows: ExecutorComparisonRow[] = [
  {
    dimension: 'Category',
    executor: 'Tool — routes MCP calls, injects secrets, meters executions',
    clawql:
      'Operating system for agents — gateway, memory, search, security, IDP, and optional sovereign inference in one platform',
  },
  {
    dimension: 'Developer adoption',
    executor: 'Head start: strong developer marketing, YC backing, and growing community mindshare',
    clawql:
      'Later entrant with deeper stack — published case studies, open-source core, and a self-host evaluation path',
  },
  {
    dimension: 'Token efficiency architecture',
    executor: 'One layer: search-and-execute pattern only',
    clawql:
      'Compounding token-efficiency layers on top of search/execute — Code Mode, response trimming, caching, model escalation, and gateway refinements shipped; fine-tuning flywheel planned',
  },
  {
    dimension: 'Agent memory',
    executor: 'None',
    clawql:
      'Built-in Obsidian vault — agents recall architectural decisions from prior sessions. No egress penalties on memory recall',
  },
  {
    dimension: 'Semantic search',
    executor: 'None',
    clawql: 'Onyx enterprise search — 40+ connectors, hybrid keyword + vector, citation-backed results',
  },
  {
    dimension: 'Security architecture',
    executor: 'Host-side secret injection and audit logging (WORM/Merkle unverified for Executor v2 — see /benchmarks)',
    clawql:
      'Kata VM isolation, WORM Merkle audit logs, Panguard fail-closed ATR, model weight integrity verification, Presidio pre-log redaction',
  },
  {
    dimension: 'Document processing pipeline',
    executor: 'None',
    clawql: 'Full IDP — Tika, Gotenberg, Stirling-PDF, archive layer, Merkle audit per step',
  },
  {
    dimension: 'Virtual data room',
    executor: 'None',
    clawql: 'Coneshare VDR included from IDP Starter tier — trackable links, engagement analytics, watermarking',
  },
  {
    dimension: 'Sovereign LLM inference',
    executor: 'None — all inference routes to external APIs',
    clawql:
      'Tenant-bound fine-tuned open model inside the boundary — Istio egress block, no tokens leave the namespace. Vertical adapters are early; we name maturity risk openly',
  },
  {
    dimension: 'Execution pricing',
    executor: 'Metered executions on Team (historical v1 caps — re-verify for v2)',
    clawql: 'Unlimited executions on every tier',
  },
  {
    dimension: 'Pricing (gateway-only)',
    executor: 'Team plan — metered executions; memory/search not claimed here (see /benchmarks)',
    clawql: `Developer ${pricing.developer.monthlyPrice}/mo with vault memory; Teams ${pricing.teams.monthlyPrice}/mo adds Onyx search. IDP from ${pricing.starter.monthlyPrice}/mo`,
  },
]

export const tcoBenchmarks = [
  {
    label: 'vs executor.sh (MCP gateway)',
    scenario: 'Team connecting Cursor to GitHub, Stripe, Jira — heavy daily agent usage',
    incumbent: 'executor.sh Team — metered executions (confirm current caps/overage on executor.sh); gateway without vault memory or Onyx',
    clawql: `Teams ${pricing.teams.monthlyPrice}/mo — unlimited executions, edge-hosted gateway, vault memory, Onyx search`,
    note: '',
  },
  {
    label: 'vs Hyperscience (IDP)',
    scenario: 'Business tier: 25,000 documents/mo × ~5 pages = 125,000 pages',
    incumbent: 'Published Hyperscience bands often cite ~$0.xx–$1.50/page — upper bound ≈$187,500/mo at 125k pages; typical contract prices are lower — confirm with vendor',
    clawql: `Business (IDP bundle): ${pricing.business.monthlyPrice}/mo flat`,
    note: '',
  },
  {
    label: 'vs VDR incumbents',
    scenario: 'Starter IDP bundle with Coneshare VDR included',
    incumbent: 'Intralinks/Datasite $10K–$200K+/yr; Ansarada ~$3,069/mo for 5 GB',
    clawql: `Starter: ${pricing.starter.monthlyPrice}/mo ($3,588/yr)`,
    note: '',
  },
] as const

/** Real estate vertical — brokerage CRM + Drive disconnect. */
export const realEstateVertical = {
  headline: 'Real estate: CRM knows the deal, Drive holds the files',
  problem:
    'Keller Williams Command, eXp BoldTrail, Follow Up Boss, and Compass track contacts and pipeline — but Google Drive folders have no capability to classify title commitments, extract offer contingencies, or link documents back to the deal record. Coordinators re-read PDFs; FSBO sellers compare offers manually.',
  clawqlPitch:
    'Teams tier ($99/mo): MCP gateway connects Command API + Google Drive; Onyx indexes transaction folders semantically; vault memory threads deal context across sessions. Add IDP Starter ($299/mo) when you need classify/extract on title commitments and PSAs, or Coneshare VDR for trackable disclosure packages.',
  competitors: [
    {
      name: 'REsimpli',
      pricing: 'Basic $149/mo · Pro $299/mo · Enterprise $599/mo',
      gap: 'CRM-only for real estate investors; no MCP gateway, no semantic document layer, no VDR pipeline integration.',
    },
    {
      name: 'Dotloop / SkySlope',
      pricing: 'Per-agent transaction fees',
      gap: 'Forms, e-sign, broker compliance. Complementary to ClawQL’s document intelligence layer.',
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
  clawqlBusinessMax: `Up to ${businessAllInMonthly}/month with Sovereign Security Pack`,
  savingsNote:
    'Order-of-magnitude below published incumbent stack bands when comparing gateway+IDP+VDR bundles; "comparable capability" is not claimed for ABBYY skill catalogs. Zero external LLM API calls only with sovereign inference configured.',
  disclaimer:
    'Illustrative benchmarks from published competitor pricing bands (July 2026). Your volume and contract terms will differ — use these for order-of-magnitude comparison, not procurement quotes.',
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
    title: 'Gateway vs platform',
    body: 'executor.sh routes tool calls — a focused, well-marketed product. ClawQL covers memory, search, security, document pipeline, and sovereign inference behind one MCP endpoint. Buyers who need routing only should evaluate executor.sh alongside ClawQL.',
  },
  {
    title: 'Where executor.sh leads',
    body: 'Developer mindshare and go-to-market velocity — YC backing, community growth, and brand recognition in the MCP gateway category. Technical depth, security architecture, persistent memory, and platform breadth are where ClawQL competes.',
  },
  {
    title: 'Focus: plugin bundles',
    body: 'The surface area is large — gateway, IDP, VDR, sovereign inference, and DAOS coordination on the roadmap. Sales focus follows plugin bundles: Developer/Teams for agent builders connecting tools; Starter+ for document-heavy teams in legal, M&A, healthcare, and lending who opt into IDP explicitly. You only pay for the heavy stack when you activate it.',
  },
  {
    title: 'Shipped today vs roadmap',
    body: 'ClawQL Core (search, execute, audit, cache), vault memory, Onyx search, the IDP pipeline, and the Ouroboros evolutionary loop library are shipped and documented with case studies. DAOS swarm coordination (NSV, SGDOP, Diversity Dividends) is specified and on the P0–P3 build plan — not production-hardened yet. We separate spec from shipped code in evaluations.',
  },
  {
    title: 'Sovereign inference maturity',
    body: 'Tenant-bound fine-tuned open models and vertical adapters are a deliberate differentiation bet. Base weights and adapter tooling are newer than incumbent cloud APIs — we name that risk for regulated buyers who need references and compliance history.',
  },
  {
    title: 'Unlimited executions — deliberate pricing',
    body: 'Gateway tiers run at the global edge and scale with demand — an extra execution or memory_recall costs us almost nothing in egress. Charging per execution creates a perverse incentive to throttle agents. ClawQL prices on hosting model, storage, and plugin bundles. Metered gateways often cap usage and bill overage — confirm current Executor pricing at procurement time; equal-arm measurements live on /benchmarks.',
  },
  {
    title: 'Seamless tier upgrades',
    body: 'One MCP endpoint on every tier. Upgrade from Teams to Starter and your URL, auth token, and vault memory history stay the same — agents retain full context. IDP infrastructure activates behind the same endpoint.',
  },
  {
    title: 'Where incumbents still lead',
    body: 'ABBYY Vantage ships 150+ pre-trained skills for common document types. ClawQL Professional includes one vertical fine-tune adapter; building the full library takes time. We state this in competitive evaluations rather than overclaiming day-one parity.',
  },
] as const
