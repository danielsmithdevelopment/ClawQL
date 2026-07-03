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

export type Industry = {
  slug: string
  name: string
  headline: string
  subheadline: string
  packageName: string
  status: 'shipped' | 'partial' | 'planned'
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
