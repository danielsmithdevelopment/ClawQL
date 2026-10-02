/**
 * Canonical site origin for metadata, sitemap, and robots.
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://clawql.com).
 */
export function getSiteOrigin(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) {
    return new URL(explicit)
  }
  return new URL('http://localhost:3000')
}

export function getSiteOriginString(): string {
  return getSiteOrigin().origin.replace(/\/$/, '')
}
