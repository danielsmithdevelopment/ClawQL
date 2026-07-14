import path from 'node:path'
import { fileURLToPath } from 'node:url'

import nextMDX from '@next/mdx'

import {
  EDGE_HEAVY_HTML_CACHE_CONTROL,
  EDGE_HTML_CACHE_CONTROL,
  HEAVY_HTML_ROUTE_SOURCES,
} from './src/lib/edge-cache-control.mjs'
import { recmaPlugins } from './src/mdx/recma.mjs'
import { rehypePlugins } from './src/mdx/rehype.mjs'
import { remarkPlugins } from './src/mdx/remark.mjs'

// Dev-only: dynamic import keeps `@opennextjs/cloudflare` out of the Docker/standalone runtime trace.
async function initOpenNextCloudflareDevIfNeeded() {
  if (process.env.NODE_ENV !== 'development') return
  const { initOpenNextCloudflareForDev } = await import(
    '@opennextjs/cloudflare'
  )
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

/** Canonical origin for Link headers (build/deploy should set NEXT_PUBLIC_SITE_URL). */
const docsSiteOrigin = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://docs.clawql.com'
).replace(/\/$/, '')

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Node Docker image: traced minimal server + node_modules (see website/Dockerfile runner stage).
  output: 'standalone',
  // Monorepo: lockfile at repo root caused Next to trace from parent; OpenNext/Workers needs app-root tracing.
  outputFileTracingRoot: __dirname,
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'mdx'],
  outputFileTracingIncludes: {
    '/**/*': [
      './src/app/**/*.mdx',
      './src/generated/security-training/**/*.mdx',
      './src/generated/security-training/sitemap-paths.json',
      './public/llms.txt',
      './public/AGENTS.md',
      './public/agent-markdown.json',
    ],
  },
  // Tree-shake heavy barrel imports — smaller RSC + client bundle (helps Workers + hydration).
  experimental: {
    optimizePackageImports: [
      'framer-motion',
      '@headlessui/react',
      '@algolia/autocomplete-core',
    ],
  },
  async redirects() {
    return [
      {
        source: '/vision/master-enablement',
        destination: '/architecture',
        permanent: true,
      },
      {
        source: '/vision/technical-enablement',
        destination: '/architecture',
        permanent: true,
      },
      {
        source: '/vision/modularization',
        destination: '/architecture',
        permanent: true,
      },
      {
        source: '/vision/ecosystem',
        destination: '/vision/roadmap',
        permanent: true,
      },
      {
        source: '/learn/openclaw-and-clawql',
        destination: '/openclaw',
        permanent: true,
      },
      {
        source: '/kubernetes',
        destination: '/deployment/kubernetes',
        permanent: true,
      },
      {
        source: '/cache',
        destination: '/learn/cache-handoff-between-chats',
        permanent: true,
      },
      {
        source: '/schedule',
        destination: '/learn/schedule-notify-workflows',
        permanent: true,
      },
      {
        source: '/notify',
        destination: '/learn/schedule-notify-workflows',
        permanent: true,
      },
      {
        source: '/case-studies',
        destination: '/examples',
        permanent: true,
      },
      {
        source: '/learn/vault-memory-between-chats',
        destination: '/learn/memory#hands-on-memory-between-chats',
        permanent: true,
      },
      {
        source: '/getting-started/cursor-ios-cloud-agent',
        destination: '/agent-setup#cursor-i-os-cloud-agent',
        permanent: true,
      },
      {
        source: '/getting-started/local-agent-sandbox',
        destination: '/agent-setup#local-agent-sandbox-mac-os-seatbelt',
        permanent: true,
      },
      {
        source: '/getting-started/team-vault-sync',
        destination: '/getting-started/for-teams#team-vault-sync',
        permanent: true,
      },
      {
        source: '/getting-started/golden-host-images',
        destination: '/getting-started/for-teams#golden-host-images',
        permanent: true,
      },
      {
        source: '/getting-started/phase-1-platform-guide',
        destination: '/getting-started',
        permanent: true,
      },
      {
        source: '/getting-started/clawql-7-setup-guide',
        destination: '/getting-started',
        permanent: true,
      },
      {
        source: '/resources/migration',
        destination: '/getting-started',
        permanent: true,
      },
      {
        source: '/install',
        destination: '/quickstart#install-options',
        permanent: true,
      },
      {
        source: '/getting-started/clawql-desktop',
        destination: '/agent-setup#desktop-stdio-recommended',
        permanent: true,
      },
      {
        source: '/getting-started/clawql-release-mvp',
        destination: '/vision/immutable-releases',
        permanent: true,
      },
      {
        source: '/guides',
        destination: '/learn',
        permanent: true,
      },
    ]
  },
  /**
   * Edge / browser caching for docs.clawql.com (Cloudflare CDN honors `s-maxage` / `stale-while-revalidate`).
   * Later rules override earlier ones for the same header (Next.js merge behavior).
   */
  async headers() {
    return [
      {
        source: '/',
        headers: [
          {
            key: 'Link',
            value: [
              `<${docsSiteOrigin}/sitemap.xml>; rel="sitemap"`,
              `</llms.txt>; rel="alternate"; type="text/plain"`,
              `</auth.md>; rel="alternate"; type="text/markdown"`,
              `</AGENTS.md>; rel="author"`,
              `</openapi.json>; rel="service-desc"; type="application/openapi+json"`,
              `</.well-known/api-catalog>; rel="api-catalog"`,
              `</.well-known/agent-card.json>; rel="agent-card"; type="application/json"`,
              `</.well-known/payments.json>; rel="payment-method"`,
              `</tools>; rel="service-doc"`,
              `</spec-configuration>; rel="service-doc"`,
              `<https://raw.githubusercontent.com/danielsmithdevelopment/ClawQL/main/providers/github/openapi.yaml>; rel="service-desc"; type="application/yaml"`,
              `</api/health>; rel="status"`,
              `<https://raw.githubusercontent.com/danielsmithdevelopment/ClawQL/main/docs/mcp/mcp-tools.md>; rel="describedby"`,
            ].join(', '),
          },
        ],
      },
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: EDGE_HTML_CACHE_CONTROL,
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
      // Heavy MDX / generated routes — longest edge TTL (Worker 1102 mitigation on Cloudflare Free).
      ...HEAVY_HTML_ROUTE_SOURCES.map((source) => ({
        source,
        headers: [
          {
            key: 'Cache-Control',
            value: EDGE_HEAVY_HTML_CACHE_CONTROL,
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      })),
      {
        source: '/_next/image',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, s-maxage=31536000, immutable',
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

export default async function createNextConfig() {
  await initOpenNextCloudflareDevIfNeeded()
  return withMDX(nextConfig)
}
