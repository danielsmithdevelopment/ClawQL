import type { Metadata } from 'next'

/** Default social preview image (served from /public). */
export const DEFAULT_OG_IMAGE_PATH = '/og-image.png'

/** Pixel size of `og-image.png` (used in Open Graph metadata for crawlers). */
export const DEFAULT_OG_IMAGE_WIDTH = 1200
export const DEFAULT_OG_IMAGE_HEIGHT = 630

export const DEFAULT_OG_IMAGE_ALT =
  'ClawQL — Operating system for agents'

export type DocsPageMetadataInput = {
  /** Page `<title>` segment; root layout template appends ` - ClawQL`. */
  title: string
  /** Unique meta description (roughly 110–160 characters is ideal for snippets). */
  description: string
  /** App Router pathname, e.g. `/quickstart` or `/` for the home page. */
  path: '/' | `/${string}`
  /** `article` for long-form case studies; default `website` for guides. */
  ogType?: 'website' | 'article'
  /** Absolute title that should not use the layout template. */
  absoluteTitle?: string
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
  absoluteTitle,
}: DocsPageMetadataInput): Metadata {
  const canonicalPath =
    path === '/'
      ? '/'
      : ((path.replace(/\/+$/, '') || '/') as '/' | `/${string}`)
  const resolvedTitle = absoluteTitle ?? title

  return {
    title: absoluteTitle ? { absolute: absoluteTitle } : title,
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
      title: resolvedTitle,
      description,
      url: canonicalPath,
      siteName: 'ClawQL',
      locale: 'en_US',
      images: [
        {
          url: DEFAULT_OG_IMAGE_PATH,
          width: DEFAULT_OG_IMAGE_WIDTH,
          height: DEFAULT_OG_IMAGE_HEIGHT,
          alt: DEFAULT_OG_IMAGE_ALT,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: resolvedTitle,
      description,
      images: [DEFAULT_OG_IMAGE_PATH],
    },
  }
}
