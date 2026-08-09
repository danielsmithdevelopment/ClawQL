import { type MetadataRoute } from 'next'

import pluginPaths from '@/generated/clawql-plugins/sitemap-paths.json'
import trainingPaths from '@/generated/security-training/sitemap-paths.json'
import { getSiteOrigin } from '@/lib/site-url'

/** Sitemap is fully static URLs; avoid per-request `lastModified` churn for crawlers. */
export const dynamic = 'force-static'

type Entry = {
  path: '/' | `/${string}`
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']
  priority: number
}

/** Static doc routes (app router MDX pages). Priority: home and entry guides highest; reference pages next. */
const ENTRIES: Array<Entry> = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  {
    path: '/vision/idp-platform',
    changeFrequency: 'monthly',
    priority: 0.75,
  },
  {
    path: '/vision/immutable-releases',
    changeFrequency: 'monthly',
    priority: 0.88,
  },
  {
    path: '/vision/slide-deck',
    changeFrequency: 'monthly',
    priority: 0.55,
  },
  { path: '/getting-started', changeFrequency: 'weekly', priority: 0.96 },
  {
    path: '/getting-started/for-teams',
    changeFrequency: 'weekly',
    priority: 0.95,
  },
  {
    path: '/getting-started/inference',
    changeFrequency: 'weekly',
    priority: 0.96,
  },
  {
    path: '/getting-started/custom-sources',
    changeFrequency: 'weekly',
    priority: 0.95,
  },
  {
    path: '/getting-started/immutable-releases',
    changeFrequency: 'weekly',
    priority: 0.94,
  },
  {
    path: '/contributing/technical-specification',
    changeFrequency: 'monthly',
    priority: 0.88,
  },
  {
    path: '/design/operator-target-architecture',
    changeFrequency: 'monthly',
    priority: 0.55,
  },
  {
    path: '/architecture/token-efficiency',
    changeFrequency: 'monthly',
    priority: 0.9,
  },
  {
    path: '/architecture/enterprise-ontology',
    changeFrequency: 'monthly',
    priority: 0.9,
  },
  {
    path: '/specs/cq-extensions',
    changeFrequency: 'monthly',
    priority: 0.9,
  },
  {
    path: '/specs/cq-extensions/cqe',
    changeFrequency: 'monthly',
    priority: 0.85,
  },
  {
    path: '/specs/cq-extensions/cqm',
    changeFrequency: 'monthly',
    priority: 0.85,
  },
  {
    path: '/specs/cq-extensions/cqk',
    changeFrequency: 'monthly',
    priority: 0.85,
  },
  {
    path: '/specs/cq-extensions/cqw',
    changeFrequency: 'monthly',
    priority: 0.85,
  },
  {
    path: '/specs/memory/memory-recall-structured-filter',
    changeFrequency: 'monthly',
    priority: 0.9,
  },
  {
    path: '/specs/ontology/legal-domain',
    changeFrequency: 'monthly',
    priority: 0.85,
  },
  {
    path: '/architecture/agentic-fabric',
    changeFrequency: 'monthly',
    priority: 0.92,
  },
  {
    path: '/inference/clawql-inference',
    changeFrequency: 'monthly',
    priority: 0.9,
  },
  {
    path: '/payments/clawql-payments',
    changeFrequency: 'monthly',
    priority: 0.9,
  },
  {
    path: '/surveillance/clawql-surveillance',
    changeFrequency: 'monthly',
    priority: 0.88,
  },
  {
    path: '/streams/clawql-streams',
    changeFrequency: 'monthly',
    priority: 0.9,
  },
  {
    path: '/streams/clawql-durable-objects',
    changeFrequency: 'monthly',
    priority: 0.88,
  },
  {
    path: '/streams/clawql-celld',
    changeFrequency: 'monthly',
    priority: 0.88,
  },
  {
    path: '/streams/clawql-cellrt',
    changeFrequency: 'monthly',
    priority: 0.88,
  },
  {
    path: '/streams/clawql-tee',
    changeFrequency: 'monthly',
    priority: 0.88,
  },
  {
    path: '/streams/clawql-tee-airgap-audit',
    changeFrequency: 'monthly',
    priority: 0.87,
  },
  {
    path: '/streams/clawql-qr-stream-transport',
    changeFrequency: 'monthly',
    priority: 0.87,
  },
  {
    path: '/government/clawql-government',
    changeFrequency: 'monthly',
    priority: 0.88,
  },
  {
    path: '/mcp/mcp-api-adapter',
    changeFrequency: 'monthly',
    priority: 0.9,
  },
  {
    path: '/mcp/protocol-fabric',
    changeFrequency: 'monthly',
    priority: 0.9,
  },
  { path: '/agent-setup', changeFrequency: 'weekly', priority: 0.97 },
  { path: '/architecture', changeFrequency: 'monthly', priority: 0.93 },
  { path: '/reference', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/examples', changeFrequency: 'monthly', priority: 0.78 },
  { path: '/resources', changeFrequency: 'monthly', priority: 0.85 },
  { path: '/reference/protocol', changeFrequency: 'monthly', priority: 0.88 },
  { path: '/plugins', changeFrequency: 'weekly', priority: 0.95 },
  {
    path: '/reference/optional-tools',
    changeFrequency: 'monthly',
    priority: 0.82,
  },
  { path: '/reference/hitl', changeFrequency: 'monthly', priority: 0.82 },
  { path: '/resources/changelog', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/vision/roadmap', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/quickstart', changeFrequency: 'weekly', priority: 0.97 },
  { path: '/learn', changeFrequency: 'weekly', priority: 0.93 },
  {
    path: '/learn/search-and-execute-mcp',
    changeFrequency: 'monthly',
    priority: 0.89,
  },
  {
    path: '/learn/external-ingest-knowledge',
    changeFrequency: 'monthly',
    priority: 0.89,
  },
  {
    path: '/learn/knowledge-search-onyx',
    changeFrequency: 'monthly',
    priority: 0.89,
  },
  {
    path: '/learn/document-pipeline',
    changeFrequency: 'monthly',
    priority: 0.89,
  },
  {
    path: '/learn/sandbox-exec',
    changeFrequency: 'monthly',
    priority: 0.89,
  },
  {
    path: '/learn/ouroboros-tools',
    changeFrequency: 'monthly',
    priority: 0.89,
  },
  {
    path: '/learn/effect-ts',
    changeFrequency: 'monthly',
    priority: 0.89,
  },
  {
    path: '/learn/memory',
    changeFrequency: 'monthly',
    priority: 0.89,
  },
  {
    path: '/learn/schedule-notify-workflows',
    changeFrequency: 'monthly',
    priority: 0.89,
  },
  {
    path: '/learn/cache-handoff-between-chats',
    changeFrequency: 'monthly',
    priority: 0.88,
  },
  {
    path: '/learn/audit-tool-and-observability',
    changeFrequency: 'monthly',
    priority: 0.87,
  },
  { path: '/mcp-clients', changeFrequency: 'monthly', priority: 0.88 },
  { path: '/openclaw', changeFrequency: 'monthly', priority: 0.87 },
  { path: '/concepts', changeFrequency: 'monthly', priority: 0.88 },
  { path: '/deployment', changeFrequency: 'monthly', priority: 0.9 },
  {
    path: '/deployment/kubernetes',
    changeFrequency: 'monthly',
    priority: 0.88,
  },
  {
    path: '/deployment/platforms',
    changeFrequency: 'monthly',
    priority: 0.85,
  },
  {
    path: '/deployment/operations-guide',
    changeFrequency: 'monthly',
    priority: 0.92,
  },
  { path: '/tailscale', changeFrequency: 'monthly', priority: 0.87 },
  { path: '/dashboard-kubernetes', changeFrequency: 'monthly', priority: 0.87 },
  {
    path: '/docker-desktop-observability',
    changeFrequency: 'monthly',
    priority: 0.86,
  },
  { path: '/helm', changeFrequency: 'monthly', priority: 0.88 },
  { path: '/tools', changeFrequency: 'weekly', priority: 0.94 },
  { path: '/ouroboros', changeFrequency: 'monthly', priority: 0.88 },
  { path: '/ouroboros/daos', changeFrequency: 'monthly', priority: 0.6 },
  {
    path: '/ouroboros/specification',
    changeFrequency: 'monthly',
    priority: 0.55,
  },
  { path: '/ouroboros/build-plan', changeFrequency: 'monthly', priority: 0.55 },
  { path: '/spec-configuration', changeFrequency: 'monthly', priority: 0.85 },
  { path: '/troubleshooting', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/security', changeFrequency: 'monthly', priority: 0.9 },
  {
    path: '/security/defense-in-depth',
    changeFrequency: 'monthly',
    priority: 0.89,
  },
  {
    path: '/hitl-label-studio',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  { path: '/onyx-knowledge', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/flink-onyx-sync', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/nats-jetstream', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/graphql-proxy', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/bundled-specs', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/benchmarks', changeFrequency: 'monthly', priority: 0.75 },
  {
    path: '/case-studies/cloudflare-docs-mcp',
    changeFrequency: 'monthly',
    priority: 0.78,
  },
  {
    path: '/case-studies/vault-memory-github-session-2026-04',
    changeFrequency: 'monthly',
    priority: 0.78,
  },
  {
    path: '/case-studies/cross-thread-vault-recall',
    changeFrequency: 'monthly',
    priority: 0.78,
  },
  {
    path: '/case-studies/truenas-scale-corgicave-homelab',
    changeFrequency: 'monthly',
    priority: 0.78,
  },
  {
    path: '/case-studies/docs-clawql-worker-1102-mcp-memory-2026-04',
    changeFrequency: 'monthly',
    priority: 0.78,
  },
  {
    path: '/case-studies/slide-deck-github-parity-cache-memory-recall-2026-04',
    changeFrequency: 'monthly',
    priority: 0.78,
  },
  {
    path: '/case-studies/openclaw-clawql-memory-recall-2026-06',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
]

function trainingSitemapEntries(): Entry[] {
  return (trainingPaths as string[]).map((p) => ({
    path: p as Entry['path'],
    changeFrequency: 'monthly' as const,
    priority: p === '/security/best-practices' ? 0.9 : 0.86,
  }))
}

function pluginSitemapEntries(): Entry[] {
  return (pluginPaths as string[]).map((p) => ({
    path: p as Entry['path'],
    changeFrequency: 'monthly' as const,
    priority: p === '/plugins' ? 0.9 : 0.87,
  }))
}

const ALL_ENTRIES: Entry[] = [
  ...ENTRIES,
  ...trainingSitemapEntries(),
  ...pluginSitemapEntries(),
]

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteOrigin().toString().replace(/\/$/, '')

  return ALL_ENTRIES.map(({ path, changeFrequency, priority }) => {
    const url = path === '/' ? `${base}/` : `${base}${path}`
    return {
      url,
      changeFrequency,
      priority,
    }
  })
}
