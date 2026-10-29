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
  // Disallow Next.js RSC flight query URLs — not documents; bots hammering them
  // burn Workers CPU. Middleware also 429s these without `RSC: 1`.
  {
    userAgent: '*',
    allow: '/',
    disallow: ['/*?*_rsc=', '/*?*&_rsc=', '/*?*rsc=', '/*?*&rsc='],
  },
  { userAgent: 'GPTBot', allow: '/', disallow: ['/*?*_rsc=', '/*?*rsc='] },
  {
    userAgent: 'ChatGPT-User',
    allow: '/',
    disallow: ['/*?*_rsc=', '/*?*rsc='],
  },
  {
    userAgent: 'Google-Extended',
    allow: '/',
    disallow: ['/*?*_rsc=', '/*?*rsc='],
  },
  { userAgent: 'ClaudeBot', allow: '/', disallow: ['/*?*_rsc=', '/*?*rsc='] },
  { userAgent: 'Claude-Web', allow: '/', disallow: ['/*?*_rsc=', '/*?*rsc='] },
  {
    userAgent: 'anthropic-ai',
    allow: '/',
    disallow: ['/*?*_rsc=', '/*?*rsc='],
  },
  {
    userAgent: 'PerplexityBot',
    allow: '/',
    disallow: ['/*?*_rsc=', '/*?*rsc='],
  },
  {
    userAgent: 'Applebot-Extended',
    allow: '/',
    disallow: ['/*?*_rsc=', '/*?*rsc='],
  },
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
