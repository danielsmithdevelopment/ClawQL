import type { MetadataRoute } from 'next'

import { getSiteOriginString } from '@/lib/site-url'

export const dynamic = 'force-static'

const ROUTES: Array<{
  path: '/' | `/${string}`
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']
  priority: number
}> = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/pricing', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/signup', changeFrequency: 'monthly', priority: 0.85 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/inference/gtm', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/idp', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/idp/gtm', changeFrequency: 'monthly', priority: 0.88 },
  { path: '/enterprise/gtm', changeFrequency: 'monthly', priority: 0.75 },
  { path: '/privacy-policy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/industries', changeFrequency: 'monthly', priority: 0.75 },
  { path: '/industries/lending', changeFrequency: 'monthly', priority: 0.65 },
  { path: '/industries/real-estate', changeFrequency: 'monthly', priority: 0.65 },
  { path: '/industries/surveillance', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/industries/government', changeFrequency: 'monthly', priority: 0.65 },
  { path: '/industries/healthcare', changeFrequency: 'monthly', priority: 0.65 },
  { path: '/industries/legal', changeFrequency: 'monthly', priority: 0.65 },
  { path: '/industries/insurance', changeFrequency: 'monthly', priority: 0.65 },
  { path: '/industries/education', changeFrequency: 'monthly', priority: 0.65 },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteOriginString()

  return ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: path === '/' ? `${base}/` : `${base}${path}/`,
    changeFrequency,
    priority,
  }))
}
