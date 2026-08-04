import type { ComponentType } from 'react'

import Body0 from './bodies/core.mdx'
import Body1 from './bodies/panguard-proxy.mdx'
import Body2 from './bodies/memory.mdx'
import Body3 from './bodies/codegraph.mdx'
import Body4 from './bodies/documents.mdx'
import Body5 from './bodies/bundled-providers.mdx'
import Body6 from './bodies/automation.mdx'
import Body7 from './bodies/sandbox.mdx'
import Body8 from './bodies/inference-providers.mdx'
import Body9 from './bodies/ouroboros.mdx'
import Body10 from './bodies/payments.mdx'
import Body11 from './bodies/hitl-label-studio.mdx'
import Body12 from './bodies/third-party.mdx'

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
    description: 'Always-on ClawQL Core — search, execute, audit, and cache. Not optional plugins; composed in clawql-api on every install.',
    status: 'always-on',
    package: 'clawql-api',
    prev: null,
    next: 'panguard-proxy',
  },
  {
    slug: 'panguard-proxy',
    title: 'Panguard MCP proxy',
    description: 'In-process beforeCallTool policy chokepoint for JWT ATR and enterprise MCP defense-in-depth. Default on; disable with CLAWQL_PANGUARD_PROXY_PLUGIN=0.',
    status: 'default-on',
    package: 'clawql-api (PanguardProxyPlugin)',
    prev: 'core',
    next: 'memory',
  },
  {
    slug: 'memory',
    title: 'Memory (vault)',
    description: 'Durable Obsidian vault tools memory_ingest and memory_recall. Default on; opt out with CLAWQL_ENABLE_MEMORY=0.',
    status: 'default-on',
    package: 'clawql-memory',
    prev: 'panguard-proxy',
    next: 'codegraph',
  },
  {
    slug: 'codegraph',
    title: 'Code graph (structural)',
    description: 'Structural code indexing via codegraph_* MCP tools. Opt-in with CLAWQL_ENABLE_CODEGRAPH=1.',
    status: 'opt-in',
    package: 'clawql-codegraph',
    prev: 'memory',
    next: 'documents',
  },
  {
    slug: 'documents',
    title: 'Documents & IDP',
    description: 'ingest_external_knowledge, optional Onyx search, inspect_pdf, and opt-in IDP pipeline tools. Default on; CLAWQL_ENABLE_DOCUMENTS=0 to omit.',
    status: 'default-on',
    package: 'clawql-documents',
    prev: 'codegraph',
    next: 'bundled-providers',
  },
  {
    slug: 'bundled-providers',
    title: 'Bundled providers',
    description: 'Opinionated default API stack on install, all-providers for everything, and CLAWQL_ENABLE_* cloud add-ons. Spec merge — not an MCP plugin.',
    status: 'default-on',
    package: 'providers/ (on-disk specs)',
    prev: 'documents',
    next: 'automation',
  },
  {
    slug: 'automation',
    title: 'Automation',
    description: 'schedule, notify, workflow, and argocd MCP tools from clawql-automation. Each tool opt-in via CLAWQL_ENABLE_* flags.',
    status: 'opt-in',
    package: 'clawql-automation',
    prev: 'bundled-providers',
    next: 'sandbox',
  },
  {
    slug: 'sandbox',
    title: 'Sandbox',
    description: 'sandbox_exec — isolated code snippets via Kata, Docker, Seatbelt, or bridge. Local agent containment via clawql sandbox init.',
    status: 'opt-in',
    package: 'clawql-sandbox',
    prev: 'automation',
    next: 'ouroboros',
  },
  {
    slug: 'inference-providers',
    title: 'Inference providers',
    description: 'BYOK provider plugins for clawql-inference — direct vendor adapters by default, OpenRouter as an optional escape hatch.',
    status: 'shipped',
    package: 'clawql-inference/plugin',
    prev: 'ouroboros',
    next: 'hitl-label-studio',
  },
  {
    slug: 'ouroboros',
    title: 'Ouroboros',
    description: 'Evolutionary loop MCP tools — seed documents, run loops, inspect lineage. CLAWQL_ENABLE_OUROBOROS=1.',
    status: 'opt-in',
    package: 'clawql-ouroboros',
    prev: 'sandbox',
    next: 'payments',
  },
  {
    slug: 'payments',
    title: 'Payments',
    description: 'Native Stripe + x402 + MPP + AP2 + ACP + PayPal + Adyen rails, plan entitlements, WORM payment audit.',
    status: 'shipped',
    package: 'clawql-payments',
    prev: 'ouroboros',
    next: 'hitl-label-studio',
  },
  {
    slug: 'hitl-label-studio',
    title: 'HITL (Label Studio)',
    description: 'hitl_enqueue_label_studio and webhook path for human-in-the-loop review. CLAWQL_ENABLE_HITL_LABEL_STUDIO=1.',
    status: 'shipped',
    package: 'src/',
    prev: 'payments',
    next: 'third-party',
  },
  {
    slug: 'third-party',
    title: 'Third-party plugins',
    description: 'Roadmap for publishing clawql-* npm plugins that depend on clawql-core and clawql-api. Extension checklist for authors.',
    status: 'roadmap',
    package: 'npm (clawql-*-plugin)',
    prev: 'hitl-label-studio',
    next: null,
  },
]

export const pluginBodies: Record<string, ComponentType> = {
  'core': Body0,
  'panguard-proxy': Body1,
  'memory': Body2,
  'codegraph': Body3,
  'documents': Body4,
  'bundled-providers': Body5,
  'automation': Body6,
  'sandbox': Body7,
  'inference-providers': Body8,
  'ouroboros': Body9,
  'payments': Body10,
  'hitl-label-studio': Body11,
  'third-party': Body12,
}

export function getPluginMeta(slug: string): PluginPageMeta | undefined {
  return pluginPages.find((p) => p.slug === slug)
}
