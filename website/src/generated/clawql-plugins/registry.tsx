import type { ComponentType } from 'react'

import Body5 from './bodies/automation.mdx'
import Body4 from './bodies/bundled-providers.mdx'
import Body0 from './bodies/core.mdx'
import Body3 from './bodies/documents.mdx'
import Body8 from './bodies/hitl-label-studio.mdx'
import Body2 from './bodies/memory.mdx'
import Body7 from './bodies/ouroboros.mdx'
import Body1 from './bodies/panguard-proxy.mdx'
import Body6 from './bodies/sandbox.mdx'
import Body9 from './bodies/third-party.mdx'

export type PluginPageMeta = {
  slug: string
  title: string
  description: string
  status: string
  package: string | null
  prev: string | null
  next: string | null
}

export const pluginPages: PluginPageMeta[] = [
  {
    slug: 'core',
    title: 'Gateway core',
    description:
      'Always-on ClawQL Core — search, execute, audit, and cache. Not optional plugins; composed in clawql-api on every install.',
    status: 'always-on',
    package: 'clawql-api',
    prev: null,
    next: 'panguard-proxy',
  },
  {
    slug: 'panguard-proxy',
    title: 'Panguard MCP proxy',
    description:
      'In-process beforeCallTool policy chokepoint for JWT ATR and enterprise MCP defense-in-depth. Default on; disable with CLAWQL_PANGUARD_PROXY_PLUGIN=0.',
    status: 'default-on',
    package: 'clawql-api (PanguardProxyPlugin)',
    prev: 'core',
    next: 'memory',
  },
  {
    slug: 'memory',
    title: 'Memory (vault)',
    description:
      'Durable Obsidian vault tools memory_ingest and memory_recall. Default on; opt out with CLAWQL_ENABLE_MEMORY=0.',
    status: 'default-on',
    package: 'clawql-memory',
    prev: 'panguard-proxy',
    next: 'documents',
  },
  {
    slug: 'documents',
    title: 'Documents & IDP',
    description:
      'ingest_external_knowledge, optional Onyx search, and opt-in IDP pipeline tools. Default on; CLAWQL_ENABLE_DOCUMENTS=0 to omit.',
    status: 'default-on',
    package: 'clawql-documents',
    prev: 'memory',
    next: 'bundled-providers',
  },
  {
    slug: 'bundled-providers',
    title: 'Bundled providers',
    description:
      'Opinionated default API stack on install, all-providers for everything, and CLAWQL_ENABLE_* cloud add-ons. Spec merge — not an MCP plugin.',
    status: 'default-on',
    package: 'providers/ (on-disk specs)',
    prev: 'documents',
    next: 'automation',
  },
  {
    slug: 'automation',
    title: 'Automation',
    description:
      'schedule, notify, workflow, and argocd MCP tools from clawql-automation. Each tool opt-in via CLAWQL_ENABLE_* flags.',
    status: 'opt-in',
    package: 'clawql-automation',
    prev: 'bundled-providers',
    next: 'sandbox',
  },
  {
    slug: 'sandbox',
    title: 'Sandbox',
    description:
      'sandbox_exec — isolated code snippets via Kata, Docker, Seatbelt, or bridge. Register with CLAWQL_ENABLE_SANDBOX=1.',
    status: 'opt-in',
    package: 'clawql-sandbox',
    prev: 'automation',
    next: 'ouroboros',
  },
  {
    slug: 'ouroboros',
    title: 'Ouroboros',
    description:
      'Evolutionary loop MCP tools — seed documents, run loops, inspect lineage. CLAWQL_ENABLE_OUROBOROS=1.',
    status: 'opt-in',
    package: 'clawql-ouroboros',
    prev: 'sandbox',
    next: 'hitl-label-studio',
  },
  {
    slug: 'hitl-label-studio',
    title: 'HITL (Label Studio)',
    description:
      'hitl_enqueue_label_studio and webhook path for human-in-the-loop review. Planned plugin wiring; CLAWQL_ENABLE_HITL_LABEL_STUDIO=1.',
    status: 'planned',
    package: 'src/ (planned clawql-automation or standalone)',
    prev: 'ouroboros',
    next: 'third-party',
  },
  {
    slug: 'third-party',
    title: 'Third-party plugins',
    description:
      'Roadmap for publishing clawql-* npm plugins that depend on clawql-core and clawql-api. Extension checklist for authors.',
    status: 'roadmap',
    package: 'npm (clawql-*-plugin)',
    prev: 'hitl-label-studio',
    next: null,
  },
]

export const pluginBodies: Record<string, ComponentType> = {
  core: Body0,
  'panguard-proxy': Body1,
  memory: Body2,
  documents: Body3,
  'bundled-providers': Body4,
  automation: Body5,
  sandbox: Body6,
  ouroboros: Body7,
  'hitl-label-studio': Body8,
  'third-party': Body9,
}

export function getPluginMeta(slug: string): PluginPageMeta | undefined {
  return pluginPages.find((p) => p.slug === slug)
}
