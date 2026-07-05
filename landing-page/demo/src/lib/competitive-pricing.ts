/** Competitive landscape benchmarks — July 2026 research. Illustrative; verify at procurement time. */

export const competitiveHeadline =
  'IDP, VDR, semantic search, and agent orchestration — competitors make you buy these separately.'

export const competitiveSummary =
  'Hyperscience, ABBYY Vantage, and legacy VDR vendors price per page, per user, or six-figure annual contracts. ClawQL charges flat monthly tiers with document volume caps — and bundles parsing, redaction, archive, Onyx search, Coneshare VDR, and MCP agent tooling in one stack.'

export const tcoBenchmarks = [
  {
    label: 'vs Hyperscience (IDP)',
    scenario: 'Business tier: 25,000 documents/mo × ~5 pages = 125,000 pages',
    incumbent: '~$1.50/page → ~$187,500/mo',
    clawql: 'Business tier: $299/mo flat',
    note: 'Volume-based IDP pricing scales linearly with every page processed.',
  },
  {
    label: 'vs ABBYY Vantage (IDP)',
    scenario: 'Same 125,000 pages/mo at mid-range ~$0.05/page',
    incumbent: '~$6,250/mo + professional services',
    clawql: 'Business tier: $299/mo flat',
    note: 'Enterprise IDP deals often run $40K–$100K/yr before services (30–60% of year-one cost).',
  },
  {
    label: 'vs VDR incumbents',
    scenario: 'Starter tier with Coneshare VDR included',
    incumbent: 'Intralinks/Datasite: $10K–$200K+/yr; $0.40–$0.85/page',
    clawql: 'Starter: $149/mo ($1,788/yr)',
    note: 'Legacy VDR adds storage overages ($100–$300/GB), per-seat fees, and setup charges.',
  },
] as const

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

/** Feature comparison vs IDP and VDR incumbents — Business tier as ClawQL reference. */
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
    feature: 'HITL review queue',
    values: { 'ClawQL Business': true, Hyperscience: true, 'ABBYY Vantage': true, 'Intralinks / Datasite': false },
    footnote: 'ClawQL uses Label Studio HITL — mature for W-2/lending samples; enterprise multi-reviewer RBAC on roadmap.',
  },
  {
    feature: 'Pre-trained document skills library',
    values: {
      'ClawQL Business': 'Vertical adapters (building)',
      Hyperscience: 'Extensive',
      'ABBYY Vantage': '150+ skills',
      'Intralinks / Datasite': false,
    },
    footnote:
      'ABBYY ships broad pre-built skills day one. ClawQL composes classify/extract/HITL per vertical — honest gap until vertical packages ship.',
  },
  {
    feature: 'SSO / SAML',
    values: { 'ClawQL Business': false, Hyperscience: true, 'ABBYY Vantage': true, 'Intralinks / Datasite': true },
    footnote: 'ClawQL Dedicated includes SSO/RBAC; Enterprise adds full SAML programs.',
  },
  {
    feature: 'Pricing model',
    values: {
      'ClawQL Business': '$299/mo flat',
      Hyperscience: '~$0.50–$1.50/page',
      'ABBYY Vantage': '$40K–$100K+/yr',
      'Intralinks / Datasite': '$10K–$200K+/yr',
    },
  },
]

export const competitiveHonestyNotes = [
  {
    title: 'Why flat pricing can look “too cheap”',
    body: 'Procurement teams comparing $299/mo to six-figure IDP or VDR quotes may assume something is missing. The answer is bundle economics: you are not buying a single capability — and ClawQL self-host and managed options eliminate separate infrastructure engineering teams that incumbents bake into TCO arguments.',
  },
  {
    title: 'The per-page TCO counter-argument',
    body: 'Hyperscience argues per-page quotes ignore engineering hours, infra scaling, and model maintenance. ClawQL counters with managed hosting (no separate ops team), self-host for teams who want control, and a fine-tuned model pipeline that improves from Langfuse traces rather than manual retraining projects.',
  },
  {
    title: 'Where incumbents still lead',
    body: 'ABBYY Vantage ships 150+ pre-trained skills for common document types. ClawQL’s answer is vertical fine-tune adapters and the full IDP + VDR + agent stack — but those vertical packages take time to build. We do not claim parity on day-one skill libraries.',
  },
] as const
