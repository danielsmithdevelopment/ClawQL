import type { Metadata } from 'next'

/** Default social preview image (served from /public). */
export const DEFAULT_OG_IMAGE_PATH = '/ClawQL-logo.jpeg'

export type DocsPageMetadataInput = {
  /** Page `<title>` segment; root layout template appends ` - ClawQL`. */
  title: string
  /** Unique meta description (roughly 110–160 characters is ideal for snippets). */
  description: string
  /** App Router pathname, e.g. `/quickstart` or `/` for the home page. */
  path: '/' | `/${string}`
  /** `article` for long-form case studies; default `website` for guides. */
  ogType?: 'website' | 'article'
}

/**
 * Consistent SEO metadata for docs pages: canonical URL, Open Graph, Twitter Card,
 * and explicit indexing rules (paired with `metadataBase` in `layout.tsx`).
 */
export function docsPageMetadata({
  title,
  description,
  path,
  ogType = 'website',
}: DocsPageMetadataInput): Metadata {
  const canonicalPath =
    path === '/'
      ? '/'
      : ((path.replace(/\/+$/, '') || '/') as '/' | `/${string}`)

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-snippet': -1,
        'max-image-preview': 'large',
        'max-video-preview': -1,
      },
    },
    openGraph: {
      type: ogType,
      title,
      description,
      url: canonicalPath,
      siteName: 'ClawQL',
      locale: 'en_US',
      images: [
        {
          url: DEFAULT_OG_IMAGE_PATH,
          alt: 'ClawQL — MCP server for OpenAPI, Swagger, and Google Discovery APIs',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [DEFAULT_OG_IMAGE_PATH],
    },
  }
}
