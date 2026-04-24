import { type MetadataRoute } from 'next'

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
  { path: '/quickstart', changeFrequency: 'weekly', priority: 0.95 },
  { path: '/install', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/mcp-clients', changeFrequency: 'monthly', priority: 0.88 },
  { path: '/concepts', changeFrequency: 'monthly', priority: 0.88 },
  { path: '/deployment', changeFrequency: 'monthly', priority: 0.88 },
  { path: '/kubernetes', changeFrequency: 'monthly', priority: 0.88 },
  { path: '/helm', changeFrequency: 'monthly', priority: 0.88 },
  { path: '/tools', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/spec-configuration', changeFrequency: 'monthly', priority: 0.85 },
  { path: '/troubleshooting', changeFrequency: 'monthly', priority: 0.82 },
  { path: '/cache', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/notify', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/onyx-knowledge', changeFrequency: 'monthly', priority: 0.8 },
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
]

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteOrigin().toString().replace(/\/$/, '')

  return ENTRIES.map(({ path, changeFrequency, priority }) => {
    const url = path === '/' ? `${base}/` : `${base}${path}`
    return {
      url,
      changeFrequency,
      priority,
    }
  })
}
