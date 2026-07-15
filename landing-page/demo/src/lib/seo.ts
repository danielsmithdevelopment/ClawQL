import type { Metadata } from 'next'

import { site } from '@/lib/site'

/** Default social preview image (served from /public). */
export const DEFAULT_OG_IMAGE_PATH = '/og-image.png'

export const DEFAULT_OG_IMAGE_WIDTH = 1200
export const DEFAULT_OG_IMAGE_HEIGHT = 630

export const DEFAULT_OG_IMAGE_ALT = site.name

export type PageMetadataInput = {
  /** Page `<title>` segment; root layout template appends ` · ClawQL`. */
  title: string
  /** Unique meta description (~110–160 characters). */
  description: string
  /** App Router pathname, e.g. `/pricing` or `/` for the home page. */
  path: '/' | `/${string}`
  /** Absolute title that should not use the layout template. */
  absoluteTitle?: string
}

/**
 * Consistent SEO metadata for marketing pages: canonical URL, Open Graph, Twitter Card.
 * Paths use trailing slashes to match `trailingSlash: true` in next.config.
 */
export function pageMetadata({
  title,
  description,
  path,
  absoluteTitle,
}: PageMetadataInput): Metadata {
  const canonicalPath =
    path === '/'
      ? '/'
      : (`${path.replace(/\/+$/, '')}/` as `/${string}/`)

  return {
    title: absoluteTitle ? { absolute: absoluteTitle } : title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: 'website',
      title: absoluteTitle ?? `${title} · ClawQL`,
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
      title: absoluteTitle ?? `${title} · ClawQL`,
      description,
      images: [DEFAULT_OG_IMAGE_PATH],
    },
  }
}
