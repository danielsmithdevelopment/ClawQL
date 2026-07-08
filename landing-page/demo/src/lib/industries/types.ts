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

export type Industry = {
  slug: string
  name: string
  headline: string
  subheadline: string
  packageName: string
  status: 'shipped' | 'partial' | 'planned'
  /** Override the default status badge label when partial/shipped/planned is too vague. */
  statusLabel?: string
  /** Short production reference — e.g. a vertical product powered by ClawQL. */
  productionReference?: string
  /** How ClawQL fits alongside incumbent systems (CRM, storage, transaction tools). */
  stackPlacement?: readonly IndustryStackRow[]
  /** Industry-wide competitive context — franchise-agnostic framing. */
  marketContext?: string
  /** One-paragraph pitch for forwarding to prospects or partners. */
  demoPitch?: string
  /** Dual-audience targeting — e.g. brokerages vs FSBO sellers on the same vertical page. */
  audiences?: readonly IndustryAudience[]
  overview: string
  painPoints: readonly { title: string; body: string }[]
  platformCapabilities: readonly string[]
  domainTools: readonly { name: string; description: string }[]
  documentTypes: readonly string[]
  useCases: readonly { title: string; body: string }[]
  examples: readonly IndustryExample[]
  compliance: readonly string[]
  relatedResources: readonly IndustryResource[]
  docsHref: string
  disclaimer?: string
}
