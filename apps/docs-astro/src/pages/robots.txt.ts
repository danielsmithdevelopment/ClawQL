import type { APIRoute } from 'astro'
import { getSiteOrigin } from '@/lib/site'

export const GET: APIRoute = () => {
  const origin = getSiteOrigin()
  const body = `User-agent: *
Allow: /
# Next.js RSC flight URLs must never return here (static Astro has none).
# Keep disallow patterns for any legacy indexed ?_rsc= URLs.
Disallow: /*?*_rsc=
Disallow: /*?*rsc=

Sitemap: ${origin}/sitemap-index.xml
`
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
