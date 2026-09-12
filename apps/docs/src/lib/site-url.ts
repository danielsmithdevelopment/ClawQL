/**
 * Canonical site origin for metadata, sitemap, and robots.
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://docs.example.com).
 * On Vercel, VERCEL_URL is used when NEXT_PUBLIC_SITE_URL is unset.
 */
export function getSiteOrigin(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) {
    return new URL(explicit)
  }
  const vercel = process.env.VERCEL_URL
  if (vercel) {
    return new URL(`https://${vercel}`)
  }
  return new URL('http://localhost:3000')
}
