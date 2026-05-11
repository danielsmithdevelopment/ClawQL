import type { MetadataRoute } from 'next'

import { getSiteOrigin } from '@/lib/site-url'

export const dynamic = 'force-static'

export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin().origin.replace(/\/$/, '')
  const host = getSiteOrigin().hostname

  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${origin}/sitemap.xml`,
    host,
  }
}
