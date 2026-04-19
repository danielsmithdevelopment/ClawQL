import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import nextMDX from '@next/mdx'

import { recmaPlugins } from './src/mdx/recma.mjs'
import { rehypePlugins } from './src/mdx/rehype.mjs'
import { remarkPlugins } from './src/mdx/remark.mjs'
import withSearch from './src/mdx/search.mjs'

// Dev-only: avoids starting Miniflare/workerd during `next build` / OpenNext deploy (SQLite readonly errors).
if (process.env.NODE_ENV === 'development') {
  initOpenNextCloudflareForDev()
}

const withMDX = nextMDX({
  options: {
    remarkPlugins,
    rehypePlugins,
    recmaPlugins,
  },
})

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Monorepo: lockfile at repo root caused Next to trace from parent; OpenNext/Workers needs app-root tracing.
  outputFileTracingRoot: __dirname,
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'mdx'],
  outputFileTracingIncludes: {
    '/**/*': ['./src/app/**/*.mdx'],
  },
  /**
   * Edge / browser caching for docs.clawql.com (Cloudflare CDN honors `s-maxage` / `stale-while-revalidate`).
   * Later rules override earlier ones for the same header (Next.js merge behavior).
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value:
              'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/_next/image',
        headers: [
          {
            key: 'Cache-Control',
            value:
              'public, max-age=31536000, s-maxage=31536000, immutable',
          },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },
}

export default withSearch(withMDX(nextConfig))
