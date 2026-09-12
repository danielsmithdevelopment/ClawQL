import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache'

/**
 * Fully static docs site (force-static routes). Serve prerendered HTML from Workers
 * Static Assets + cache interception so cold requests skip NextServer JS when possible.
 * @see https://opennext.js.org/cloudflare/caching#ssg-site
 */
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
})
