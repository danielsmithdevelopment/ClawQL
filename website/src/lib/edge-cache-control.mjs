/**
 * Shared Cache-Control values for docs.clawql.com (Cloudflare Workers + CDN).
 * Imported from next.config.mjs and mirrored in public/_headers where applicable.
 *
 * HTML TTLs must stay short: prerendered HTML embeds hashed `/_next/static/*.css`
 * URLs. Long edge HTML caches after a deploy serve stale markup that points at
 * CSS files that no longer exist → unstyled pages (FOUC that never recovers).
 * Hashed static assets remain immutable / long-lived.
 */

/** Default HTML: browsers revalidate; edge may keep a brief soft cache. */
export const EDGE_HTML_CACHE_CONTROL =
  'public, max-age=0, must-revalidate, s-maxage=60, stale-while-revalidate=300'

/**
 * Large MDX / generated bodies: slightly longer edge reuse than default HTML,
 * still short enough that post-deploy hashed CSS links cannot linger for days.
 */
export const EDGE_HEAVY_HTML_CACHE_CONTROL =
  'public, max-age=0, must-revalidate, s-maxage=300, stale-while-revalidate=900'

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
  '/architecture/enterprise-ontology',
  '/specs/cq-extensions',
  '/specs/cq-extensions/cqe',
  '/specs/cq-extensions/cqm',
  '/specs/cq-extensions/cqk',
  '/specs/cq-extensions/cqw',
  '/specs/memory/memory-recall-structured-filter',
  '/specs/ontology/legal-domain',
  '/architecture/agentic-fabric',
  '/inference/:path*',
  '/examples/:path*',
]
