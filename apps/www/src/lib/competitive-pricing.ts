/** Competitive landscape benchmarks — illustrative; verify at procurement time. */

import { businessAllInMonthly, pricing, unlimitedExecutionsTagline } from './pricing'

export const competitiveHeadline = 'Plugin bundles — price each layer against the right incumbent.'

export const competitiveSummary =
  'ClawQL is agentic infrastructure. Developer and Teams tiers are a managed MCP gateway with vault memory and semantic search across connected sources. Starter through Professional compete with IDP and VDR incumbents — only when you opt into document processing. Gateway buyers pay for gateway; document processing activates separately. Managed prices are early-access figures, subject to change until unit costs are measured.'

/** Neutral gateway-only note — not a head-to-head until re-verified against Executor v2 and offered for review. */
export const gatewayOnlyNote = {
  title: 'Need routing only?',
  body: 'Evaluate gateway-only tools alongside ClawQL. ClawQL’s managed tiers add vault memory, semantic search, core governance (approvals, untrusted labels, vault credentials, WORM audit), and an optional IDP bundle behind one MCP endpoint.',
} as const

export type ExecutorComparisonRow = {
  dimension: string
  executor: string
  clawql: string
}

/** Head-to-head rows retired until Executor v2 is re-verified and offered for maintainer review. */
export const executorComparisonRows: ExecutorComparisonRow[] = []

/** Minimal stub for any remaining imports that expected the old executor benchmark object. */
export const executorBenchmark = {
  name: 'Gateway-only tools',
  href: '/cloud',
  positioning: gatewayOnlyNote.body,
  pricing: [] as readonly { tier: string; price: string; includes: string }[],
  clawqlResponse: {
    tiers: `Developer ${pricing.developer.monthlyPrice}/mo · Teams ${pricing.teams.monthlyPrice}/mo (early access; subject to change)`,
    advantage: gatewayOnlyNote.body,
    closing: unlimitedExecutionsTagline,
  },
} as const

export const tcoBenchmarks = [
  {
    label: 'vs gateway-only MCP routers',
    scenario: 'Team connecting Cursor to GitHub, Stripe, Jira — heavy daily agent usage',
    incumbent: 'Metered gateway tools often cap executions and charge overage as agents work harder',
    clawql: `Teams ${pricing.teams.monthlyPrice}/mo (early access) — ${unlimitedExecutionsTagline}; vault memory; semantic search`,
    note: 'Illustrative — verify competitor quotes at procurement time (2026-11-11).',
  },
  {
    label: 'vs Hyperscience (IDP)',
    scenario: 'Business tier: 25,000 documents/mo × ~5 pages = 125,000 pages',
    incumbent: '~$1.50/page → ~$187,500/mo (published list-band; July 2026 illustrative)',
    clawql: `Business (IDP bundle): ${pricing.business.monthlyPrice}/mo flat (early access; subject to change)`,
    note: 'Illustrative — add your contract terms before procurement.',
  },
  {
    label: 'vs VDR incumbents',
    scenario: 'Starter IDP bundle with Coneshare VDR included',
    incumbent: 'Intralinks/Datasite $10K–$200K+/yr; Ansarada ~$3,069/mo for 5 GB (published bands; July 2026 illustrative)',
    clawql: `Starter: ${pricing.starter.monthlyPrice}/mo ($3,588/yr early-access figure)`,
    note: 'Illustrative — verify incumbent quotes at procurement time.',
  },
] as const

/** Real estate vertical — brokerage CRM + Drive disconnect. */
export const realEstateVertical = {
  headline: 'Real estate: CRM knows the deal, Drive holds the files',
  problem:
    'Keller Williams Command, eXp BoldTrail, Follow Up Boss, and Compass track contacts and pipeline — but Google Drive folders have no capability to classify title commitments, extract offer contingencies, or link documents back to the deal record. Coordinators re-read PDFs; FSBO sellers compare offers manually.',
  clawqlPitch:
    'Teams tier: MCP gateway connects Command API + Google Drive; semantic search indexes transaction folders; vault memory threads deal context across sessions. Add IDP Starter when you need classify/extract on title commitments and PSAs, or Coneshare VDR for trackable disclosure packages. Early-access prices subject to change.',
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
    'Gateway + IDP + VDR + search + compliance tooling as separate contracts — illustrative stack, not a named procurement quote.',
  clawqlBusiness: `${pricing.business.monthlyPrice}/month (early access; subject to change)`,
  clawqlBusinessMax: `Up to ${businessAllInMonthly}/month with Sovereign Security Pack extras`,
  savingsNote:
    'Order-of-magnitude below a multi-vendor stack at comparable capability when IDP is activated — not a measured win claim.',
  disclaimer:
    'Illustrative benchmarks from published competitor pricing bands (dated July 2026; reviewed 2026-11-11). Your volume and contract terms will differ — use these for order-of-magnitude comparison, not procurement quotes.',
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
    values: {
      'ClawQL Business': true,
      Hyperscience: 'Partial',
      'ABBYY Vantage': true,
      'Intralinks / Datasite': 'Add-on',
    },
  },
  {
    feature: 'Virtual data room',
    values: {
      'ClawQL Business': 'Coneshare included',
      Hyperscience: false,
      'ABBYY Vantage': false,
      'Intralinks / Datasite': true,
    },
  },
  {
    feature: 'MCP gateway + agent memory',
    values: {
      'ClawQL Business': true,
      Hyperscience: false,
      'ABBYY Vantage': false,
      'Intralinks / Datasite': false,
    },
  },
  {
    feature: 'Semantic search across connected sources',
    values: {
      'ClawQL Business': true,
      Hyperscience: false,
      'ABBYY Vantage': false,
      'Intralinks / Datasite': 'Limited',
    },
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
      'ClawQL Business': `${pricing.business.monthlyPrice}/mo flat (early access; subject to change)`,
      Hyperscience: '~$0.50–$1.50/page (illustrative July 2026)',
      'ABBYY Vantage': '$40K–$100K+/yr (illustrative July 2026)',
      'Intralinks / Datasite': '$10K–$200K+/yr (illustrative July 2026)',
    },
  },
]

export const competitiveHonestyNotes = [
  {
    title: 'Gateway vs platform',
    body: gatewayOnlyNote.body,
  },
  {
    title: 'Focus: plugin bundles',
    body: 'The surface area is large — gateway, IDP, VDR, sovereign inference, and coordination on the roadmap. Sales focus follows plugin bundles: Developer/Teams for agent builders connecting tools; Starter+ for document-heavy teams who opt into IDP explicitly. You only pay for the heavy stack when you activate it.',
  },
  {
    title: 'Shipped today vs roadmap',
    body: 'ClawQL Core (search, execute, audit, cache), vault memory, optional semantic search, the IDP pipeline, and the Ouroboros evolutionary loop library are shipped as open packages and demos. Cloud durable agents, containers, webhook ingress, and one-click harnesses are planned. We separate demos and benchmarks from production-customer claims.',
  },
  {
    title: 'Sovereign inference maturity',
    body: 'Tenant-bound fine-tuned models (Qwen3.6 family and vertical adapters) are a deliberate differentiation bet. Base weights and adapter tooling are newer than incumbent cloud APIs — we name that risk for regulated buyers who need references and compliance history.',
  },
  {
    title: 'Executions and early-access pricing',
    body: 'Hosted tiers do not meter per MCP execution today; fair-use language applies until unit costs are measured on a real host. Managed dollar prices on this page are early-access figures and may change. See /cloud for the product plan.',
  },
  {
    title: 'Seamless tier upgrades',
    body: 'One MCP endpoint on every tier. Upgrade from Teams to Starter and your URL, auth token, and vault memory history stay the same — agents retain full context. IDP infrastructure activates behind the same endpoint.',
  },
  {
    title: 'Where incumbents still lead',
    body: 'ABBYY Vantage ships 150+ pre-trained skills for common document types. ClawQL Professional includes one vertical fine-tune adapter; building the full library takes time. We state this in competitive evaluations rather than overclaiming day-one parity.',
  },
  {
    title: 'Licensing',
    body: 'Self-host the Apache 2.0 packages in this repository with no license fee. Some packages listed in the network whitepaper design table remain private or BSL and are not part of that self-host path.',
  },
] as const
