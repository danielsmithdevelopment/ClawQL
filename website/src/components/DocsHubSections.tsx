'use client'

import { DocsHubGrid } from '@/components/DocsHubGrid'
import {
  architectureHubCards,
  deploymentHubCards,
  exampleSiteCards,
  guidesHubCards,
  optionalToolsHubCards,
  referenceHubCards,
  resourcesHubCards,
} from '@/lib/docs-hub-data'

export function ArchitectureHubGrid() {
  return <DocsHubGrid cards={architectureHubCards} />
}

export function DeploymentHubGrid() {
  return <DocsHubGrid cards={deploymentHubCards} />
}

export function GuidesHubGrid() {
  return <DocsHubGrid cards={guidesHubCards} />
}

export function ReferenceHubGrid() {
  return <DocsHubGrid cards={referenceHubCards} />
}

export function ExamplesHubGrid() {
  return <DocsHubGrid cards={exampleSiteCards} />
}

export function ResourcesHubGrid() {
  return <DocsHubGrid cards={resourcesHubCards} />
}

export function OptionalToolsHubGrid() {
  return <DocsHubGrid cards={optionalToolsHubCards} />
}
