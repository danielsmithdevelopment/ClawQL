export type IndustryWorkflowStep = {
  label: string
  detail: string
}

export type IndustryExample = {
  title: string
  summary: string
  body: string
  tools: readonly string[]
  steps: readonly IndustryWorkflowStep[]
}

export type IndustryResource = {
  label: string
  href: string
}

export type IndustryStackRow = {
  system: string
  role: string
  /** Optional third column (e.g. who provides the layer). */
  provider?: string
}

export type IndustryAudience = {
  /** Anchor id for deep links — e.g. brokerage, fsbo */
  id: string
  name: string
  headline: string
  overview: string
  /** Audience-specific forward pitch; falls back to industry.demoPitch when omitted. */
  demoPitch?: string
  stackPlacement?: readonly IndustryStackRow[]
  useCases?: readonly { title: string; body: string }[]
}

export type IndustryAuditEvent = {
  event: string
  trigger: string
}

export type Industry = {
  slug: string
  name: string
  headline: string
  subheadline: string
  packageName: string
  status: 'shipped' | 'partial' | 'planned'
  /** Override the default status badge label when partial/shipped/planned is too vague. */
  statusLabel?: string
  /** Hero eyebrow text — when set, replaces the status badge. */
  heroEyebrow?: string
  /** Override Overview section headline. */
  overviewHeadline?: string
  /** Short production reference — e.g. a vertical product powered by ClawQL. */
  productionReference?: string
  /** How ClawQL fits alongside incumbent systems (CRM, storage, transaction tools). */
  stackPlacement?: readonly IndustryStackRow[]
  /** Industry-wide competitive context — franchise-agnostic framing. */
  marketContext?: string
  marketHeadline?: string
  marketSubheadline?: string
  /** One-paragraph pitch for forwarding to prospects or partners. */
  demoPitch?: string
  /** Dual-audience targeting — e.g. brokerages vs FSBO sellers on the same vertical page. */
  audiences?: readonly IndustryAudience[]
  audiencesHeadline?: string
  audiencesSubheadline?: string
  overview: string
  painPoints: readonly { title: string; body: string }[]
  painPointsHeadline?: string
  painPointsSubheadline?: string
  platformCapabilities: readonly string[]
  platformSubheadline?: string
  domainTools: readonly { name: string; description: string }[]
  domainToolsSubheadline?: string
  documentTypes: readonly string[]
  useCases: readonly { title: string; body: string }[]
  useCasesSubheadline?: string
  examples: readonly IndustryExample[]
  /** WORM / audit event catalog for verticals with forensic logging. */
  auditEvents?: readonly IndustryAuditEvent[]
  auditEventsSubheadline?: string
  compliance: readonly string[]
  complianceHeadline?: string
  complianceSubheadline?: string
  relatedResources: readonly IndustryResource[]
  docsHref: string
  disclaimer?: string
  ctaHeadline?: string
  ctaSubheadline?: string
  ctaSecondaryHref?: string
  ctaSecondaryLabel?: string
  /** Optional closing note below the CTA (e.g. scope disclaimer). */
  closingNote?: string
}
