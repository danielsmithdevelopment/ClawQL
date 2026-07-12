/**
 * Shared Cache-Control values for docs.clawql.com (Cloudflare Workers + CDN).
 * Imported from next.config.mjs and mirrored in public/_headers where applicable.
 */

/** Default HTML: browsers revalidate; edge may cache ~7d and serve stale up to ~30d. */
export const EDGE_HTML_CACHE_CONTROL =
  'public, max-age=0, s-maxage=604800, stale-while-revalidate=2592000'

/** Large MDX / generated bodies: maximize edge reuse (purge dashboard after urgent edits). */
export const EDGE_HEAVY_HTML_CACHE_CONTROL =
  'public, max-age=0, s-maxage=2592000, stale-while-revalidate=7776000'

/** Path patterns that get EDGE_HEAVY_HTML_CACHE_CONTROL in next.config headers(). */
export const HEAVY_HTML_ROUTE_SOURCES = [
  '/case-studies/:path*',
  '/vision/:path*',
  '/deployment/operations-guide',
  '/contributing/technical-specification',
  '/ouroboros/specification',
  '/security/defense-in-depth',
  '/security/best-practices/:path*',
  '/architecture/token-efficiency',
  '/inference/:path*',
  '/examples/:path*',
]
