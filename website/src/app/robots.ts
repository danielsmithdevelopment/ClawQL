import { type MetadataRoute } from 'next'

import { getSiteOrigin } from '@/lib/site-url'

export default function robots(): MetadataRoute.Robots {
  const base = getSiteOrigin().toString().replace(/\/$/, '')

  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${base}/sitemap.xml`,
  }
}
