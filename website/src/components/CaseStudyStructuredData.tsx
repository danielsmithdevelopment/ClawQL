import { JsonLd } from '@/components/JsonLd'
import { getSiteOrigin } from '@/lib/site-url'

type Props = {
  headline: string
  path: `/${string}`
  description: string
}

/**
 * Breadcrumb + TechArticle JSON-LD for case study URLs (rich results–friendly).
 */
export function CaseStudyStructuredData({
  headline,
  path,
  description,
}: Props) {
  const origin = getSiteOrigin().origin.replace(/\/$/, '')
  const url = `${origin}${path.startsWith('/') ? path : `/${path}`}`

  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: `${origin}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: headline,
            item: url,
          },
        ],
      },
      {
        '@type': 'TechArticle',
        '@id': `${url}#article`,
        headline,
        description,
        url,
        inLanguage: 'en-US',
        isAccessibleForFree: true,
        author: { '@type': 'Organization', name: 'ClawQL' },
        publisher: {
          '@type': 'Organization',
          name: 'ClawQL',
          logo: { '@type': 'ImageObject', url: `${origin}/ClawQL-logo.jpeg` },
        },
      },
    ],
  }

  return <JsonLd data={data} />
}
