import { type MetadataRoute } from 'next'

import { getSiteOrigin } from '@/lib/site-url'

/**
 * Agent / SEO discoverability: sitemap + explicit allows for common AI crawlers
 * (see Cloudflare “Is Your Site Agent-Ready?” and similar scanners).
 */
export default function robots(): MetadataRoute.Robots {
  const base = getSiteOrigin().toString().replace(/\/$/, '')
  const sitemap = `${base}/sitemap.xml`

  return {
    rules: [
      { userAgent: '*', allow: '/' },
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'ChatGPT-User', allow: '/' },
      { userAgent: 'Google-Extended', allow: '/' },
      { userAgent: 'ClaudeBot', allow: '/' },
      { userAgent: 'Claude-Web', allow: '/' },
      { userAgent: 'anthropic-ai', allow: '/' },
      { userAgent: 'PerplexityBot', allow: '/' },
      { userAgent: 'Applebot-Extended', allow: '/' },
    ],
    sitemap,
  }
}
