import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache'

/**
 * Fully static docs site (force-static routes). Serve prerendered HTML from Workers
 * Static Assets + cache interception so cold requests skip NextServer JS when possible.
 * @see https://opennext.js.org/cloudflare/caching#ssg-site
 *
 * Prefetch / `_rsc` abuse: middleware rejects flight queries without `RSC: 1`
 * (`src/lib/rsc-bot-guard.ts`). Sidebar `Link`s use `prefetch={false}` to limit
 * OpenNext RSC prefetch amplification on Cloudflare Free (see OpenNext #1334).
 * Prefer Workers Static Assets cache (below) over R2+regional-cache lazy updates.
 */
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
})
