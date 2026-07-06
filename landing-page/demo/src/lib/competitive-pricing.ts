/** Competitive landscape benchmarks — July 2026 research. Illustrative; verify at procurement time. */

import { businessAllInMonthly, executionOveragePerThousand, pricing } from './pricing'

export const competitiveHeadline =
  'Gateway, memory, and IDP — price each plugin bundle against the right incumbent.'

export const competitiveSummary =
  'ClawQL is not one product at one price. Developer and Teams tiers compete with MCP gateways like Executor on executions while adding vault memory Executor does not ship. Starter through Professional compete with IDP and VDR incumbents on document volume — a $5,000–15,000/month stack sold separately elsewhere.'

/** MCP gateway competitor — Executor.sh (YC-backed, MIT, July 2026). */
export const executorBenchmark = {
  name: 'Executor',
  href: 'https://executor.sh/',
  tagline: 'MCP gateway — one endpoint, normalized OpenAPI/GraphQL/MCP tools, sandboxed execution.',
  tokenEfficiency: '1,640 tools → ~278,800 tokens without Executor vs 1 execute tool → ~1,044 tokens with.',
  pricing: [
    { tier: 'Free', price: '$0', includes: '3 members · 10,000 executions/mo' },
    { tier: 'Team', price: '$150/org/mo', includes: 'Unlimited members · 250,000 executions/mo' },
    { tier: 'Overage', price: executionOveragePerThousand + '/1,000', includes: 'Both Free and Team' },
  ],
  clawqlResponse: {
    tier: `Developer ${pricing.developer.monthlyPrice}/mo`,
    advantage:
      'Undercuts Executor Team on price while adding Obsidian vault memory, memory_recall across sessions, and optional Onyx search on Teams — capabilities Executor lists as "coming soon" for traces only.',
    honestGap:
      'Executor ships desktop/CLI/cloud, polished onboarding, and YC distribution. ClawQL wins on memory + platform depth, not on gateway UX polish alone.',
  },
} as const

export const tcoBenchmarks = [
  {
    label: 'vs Executor (MCP gateway)',
    scenario: 'Team connecting Cursor to GitHub, Stripe, Jira — 250,000 executions/mo',
    incumbent: 'Executor Team: $150/org/mo',
    clawql: `Teams: ${pricing.teams.monthlyPrice}/mo with vault + Onyx search`,
    note: 'Developer at $29/mo undercuts for smaller teams; Teams adds semantic memory Executor does not offer.',
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
  incumbentRange: '$5,000–15,000+/month',
  incumbentDetail:
    'Across Hyperscience or ABBYY (IDP), Intralinks or Datasite (VDR), standalone enterprise search, and custom audit tooling — separate contracts and data exposure points.',
  clawqlBusiness: `${pricing.business.monthlyPrice}/month`,
  clawqlBusinessMax: `${businessAllInMonthly}/month with Sovereign Security Pack`,
  savingsNote:
    '6–20× below incumbent stack at comparable capability, with sovereign inference and zero external LLM API calls.',
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
    values: { 'ClawQL Business': true, Hyperscience: 'Partial', 'ABBYY Vantage': true, 'Intralinks / Datasite': 'Add-on' },
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
    title: 'Plugin bundles, not one-size-fits-all',
    body: 'Gateway-only buyers should not pay for Stirling, Gotenberg, and GPU inference. Developer ($29) and Teams ($99) compete on executions and memory. IDP tiers ($299+) are explicitly opted-in document processing — priced against Hyperscience and Intralinks, not Executor.',
  },
  {
    title: 'Respect Executor on gateway UX',
    body: 'Executor is YC-backed, MIT licensed, and genuinely good at context-efficient MCP routing. ClawQL matches search/execute efficiency and adds durable vault memory, Onyx search, and an optional IDP platform Executor does not attempt.',
  },
  {
    title: 'Where incumbents still lead',
    body: 'ABBYY Vantage ships 150+ pre-trained skills for common document types. ClawQL Professional includes one vertical fine-tune adapter; building the full library takes time. We state this openly in competitive evaluations rather than overclaiming day-one parity.',
  },
] as const
