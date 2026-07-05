/** Competitive landscape benchmarks — July 2026 research. Illustrative; verify at procurement time. */

import { businessAllInMonthly } from './pricing'

export const competitiveHeadline =
  'IDP, VDR, semantic search, and agent orchestration — competitors make you buy these separately.'

export const competitiveSummary =
  'Pricing is anchored to what ClawQL replaces — IDP vendors, VDR platforms, and compliance tooling that together run $5,000–15,000+/month. Flat tiers remain dramatically below per-page incumbents while pricing credibly against the stack, not generic SaaS.'

export const tcoBenchmarks = [
  {
    label: 'vs Hyperscience (IDP)',
    scenario: 'Business tier: 25,000 documents/mo × ~5 pages = 125,000 pages',
    incumbent: '~$1.50/page → ~$187,500/mo',
    clawql: 'Business tier: $599/mo flat',
    note: 'Volume-based IDP pricing scales linearly with every page processed.',
  },
  {
    label: 'vs ABBYY Vantage (IDP)',
    scenario: 'Same 125,000 pages/mo at mid-range ~$0.05/page',
    incumbent: '~$6,250/mo + professional services',
    clawql: 'Business tier: $599/mo flat',
    note: 'Enterprise IDP deals often run $40K–$100K/yr before services (30–60% of year-one cost).',
  },
  {
    label: 'vs VDR incumbents',
    scenario: 'Starter tier with Coneshare VDR included',
    incumbent: 'Intralinks/Datasite: $10K–$200K+/yr; Ansarada ~$3,069/mo for 5 GB',
    clawql: 'Starter: $299/mo ($3,588/yr)',
    note: 'Legacy VDR adds storage overages ($100–$300/GB), per-seat fees, and setup charges.',
  },
] as const

export const stackReplacementSummary = {
  headline: 'Full stack replacement cost (Business-tier customer)',
  profile: '25 users · 25,000 documents/month · VDR sharing with external parties',
  incumbentRange: '$5,000–15,000+/month',
  incumbentDetail:
    'Across Hyperscience or ABBYY (IDP), Intralinks or Datasite (VDR), standalone enterprise search, and custom audit tooling — separate contracts and data exposure points.',
  clawqlBusiness: '$599/month',
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
    feature: 'Virtual data room (Coneshare)',
    values: { 'ClawQL Business': true, Hyperscience: false, 'ABBYY Vantage': false, 'Intralinks / Datasite': true },
  },
  {
    feature: 'Page-level engagement analytics',
    values: { 'ClawQL Business': true, Hyperscience: false, 'ABBYY Vantage': false, 'Intralinks / Datasite': true },
  },
  {
    feature: 'Dynamic watermarking',
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
    feature: 'Data stays in tenant boundary',
    values: { 'ClawQL Business': true, Hyperscience: false, 'ABBYY Vantage': false, 'Intralinks / Datasite': false },
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
    feature: 'SSO / SAML',
    values: { 'ClawQL Business': false, Hyperscience: true, 'ABBYY Vantage': true, 'Intralinks / Datasite': true },
    footnote: 'ClawQL Professional and Enterprise include SSO/SAML.',
  },
  {
    feature: 'Pricing model',
    values: {
      'ClawQL Business': '$599/mo flat',
      Hyperscience: '~$0.50–$1.50/page',
      'ABBYY Vantage': '$40K–$100K+/yr',
      'Intralinks / Datasite': '$10K–$200K+/yr',
    },
  },
]

export const competitiveHonestyNotes = [
  {
    title: 'Value-anchored, not volume-discounted',
    body: 'Revised tiers price against the $5K–15K/month stack ClawQL replaces — not against generic SaaS. Starter at $299/mo credibly replaces DocSend plus basic IDP; Business at $599/mo replaces a multi-vendor compliance stack that incumbents sell separately.',
  },
  {
    title: 'The per-page TCO counter-argument',
    body: 'Hyperscience argues per-page quotes ignore engineering hours, infra scaling, and model maintenance. ClawQL counters with managed hosting (no separate ops team), self-host for teams who want control, and a fine-tuned model pipeline that improves from Langfuse traces rather than manual retraining projects.',
  },
  {
    title: 'Where incumbents still lead',
    body: 'ABBYY Vantage ships 150+ pre-trained skills for common document types. ClawQL Professional includes one vertical fine-tune adapter; building the full library takes time. We state this openly in competitive evaluations rather than overclaiming day-one parity.',
  },
] as const
