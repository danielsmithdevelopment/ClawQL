import { type MetadataRoute } from 'next'

import { getSiteOrigin } from '@/lib/site-url'

/** Static doc routes (app router MDX pages). */
const PATHS = [
  '/',
  '/quickstart',
  '/install',
  '/mcp-clients',
  '/spec-configuration',
  '/troubleshooting',
  '/deployment',
  '/kubernetes',
  '/helm',
  '/tools',
  '/cache',
  '/graphql-proxy',
  '/bundled-specs',
  '/concepts',
  '/benchmarks',
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteOrigin().toString().replace(/\/$/, '')

  return PATHS.map((path) => {
    const url = path === '/' ? `${base}/` : `${base}${path}`
    return {
      url,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: path === '/' ? 1 : 0.85,
    }
  })
}
