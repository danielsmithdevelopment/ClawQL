import { NextResponse } from 'next/server'

import { getSiteOrigin } from '@/lib/site-url'

/**
 * Content Signals (https://contentsignals.org/) — declare AI/search usage preferences.
 * Next.js `MetadataRoute.Robots` does not emit Content-Signal; use a plain-text route instead.
 */
const CONTENT_SIGNAL = 'Content-Signal: ai-train=no, search=yes, ai-input=no'

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
  let content = ''

  for (const rule of RULES) {
    for (const agent of resolveArray(rule.userAgent)) {
      content += `User-Agent: ${agent}\n`
    }
    content += `${CONTENT_SIGNAL}\n`
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
