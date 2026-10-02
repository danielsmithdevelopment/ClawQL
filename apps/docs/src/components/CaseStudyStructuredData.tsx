import { JsonLd } from '@/components/JsonLd'
import { DEFAULT_OG_IMAGE_PATH } from '@/lib/seo'
import { getSiteOrigin } from '@/lib/site-url'

type Props = {
  headline: string
  path: `/${string}`
  description: string
  /** ISO 8601 date; inferred from path slug (e.g. `-2026-04`) when omitted. */
  datePublished?: string
  dateModified?: string
  keywords?: string[]
}

/** Infer YYYY-MM-01 from case-study slug segments like `…-2026-04` or `…-2026-06`. */
export function dateFromCaseStudyPath(path: string): string | undefined {
  const match = path.match(/-(\d{4})-(\d{2})(?:\/|$)/)
  if (!match) return undefined
  return `${match[1]}-${match[2]}-01`
}

/**
 * Breadcrumb + Article JSON-LD for case study URLs (Google rich results).
 */
export function CaseStudyStructuredData({
  headline,
  path,
  description,
  datePublished,
  dateModified,
  keywords = ['ClawQL', 'MCP', 'case study'],
}: Props) {
  const origin = getSiteOrigin().origin.replace(/\/$/, '')
  const url = `${origin}${path.startsWith('/') ? path : `/${path}`}`
  const published = datePublished ?? dateFromCaseStudyPath(path)
  const image = `${origin}${DEFAULT_OG_IMAGE_PATH}`

  const article: Record<string, unknown> = {
    '@type': 'Article',
    '@id': `${url}#article`,
    headline,
    description,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    inLanguage: 'en-US',
    isAccessibleForFree: true,
    articleSection: 'Case study',
    keywords: keywords.join(', '),
    image: { '@type': 'ImageObject', url: image },
    author: {
      '@type': 'Organization',
      name: 'ClawQL',
      url: 'https://github.com/danielsmithdevelopment/ClawQL',
    },
    publisher: {
      '@type': 'Organization',
      name: 'ClawQL',
      logo: { '@type': 'ImageObject', url: image },
    },
    isPartOf: { '@id': `${origin}/#website` },
  }

  if (published) {
    article.datePublished = published
    article.dateModified = dateModified ?? published
  }

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
            name: 'Examples',
            item: `${origin}/examples`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: headline,
            item: url,
          },
        ],
      },
      article,
    ],
  }

  return <JsonLd data={data} />
}
