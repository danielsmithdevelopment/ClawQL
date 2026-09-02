import { NextResponse } from 'next/server'

import { getSiteOrigin } from '@/lib/site-url'

/**
 * Plain-text robots.txt (not `MetadataRoute.Robots`) so we can add comments.
 *
 * Intentionally omit Cloudflare `Content-Signal:` lines: they are non-REP
 * directives, ignored by major crawlers, and fail Lighthouse/GSC robots
 * parsers as "Unknown directive" (SEO score hit). Prefer bot-specific Allow /
 * Disallow when a preference must be machine-enforceable.
 */
const RULES: Array<{
  userAgent: string | string[]
  allow?: string | string[]
  disallow?: string | string[]
  crawlDelay?: number
}> = [
  { userAgent: '*', allow: '/' },
  { userAgent: 'GPTBot', allow: '/' },
  { userAgent: 'ChatGPT-User', allow: '/' },
  { userAgent: 'Google-Extended', allow: '/' },
  { userAgent: 'ClaudeBot', allow: '/' },
  { userAgent: 'Claude-Web', allow: '/' },
  { userAgent: 'anthropic-ai', allow: '/' },
  { userAgent: 'PerplexityBot', allow: '/' },
  { userAgent: 'Applebot-Extended', allow: '/' },
]

function resolveArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

function buildRobotsTxt(): string {
  const base = getSiteOrigin().toString().replace(/\/$/, '')
  const sitemap = `${base}/sitemap.xml`
  let content = `# ClawQL documentation robots
# Preference (informational): index for search; discourage AI training reuse.
# Enforce via bot Allow/Disallow or edge policy when needed — not Content-Signal.

`

  for (const rule of RULES) {
    for (const agent of resolveArray(rule.userAgent)) {
      content += `User-Agent: ${agent}\n`
    }
    for (const item of resolveArray(rule.allow)) {
      content += `Allow: ${item}\n`
    }
    for (const item of resolveArray(rule.disallow)) {
      content += `Disallow: ${item}\n`
    }
    if (rule.crawlDelay !== undefined) {
      content += `Crawl-delay: ${rule.crawlDelay}\n`
    }
    content += '\n'
  }

  content += `Sitemap: ${sitemap}\n`
  return content
}

export function GET() {
  return new NextResponse(buildRobotsTxt(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
