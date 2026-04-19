import { type Metadata } from 'next'

import { Providers } from '@/app/providers'
import { Layout } from '@/components/Layout'
import { type Section } from '@/components/SectionProvider'
import { getSiteOrigin } from '@/lib/site-url'

import { caseStudyCloudflareDocsSections } from '@/lib/case-study-cloudflare-docs-sections'
import { caseStudyVaultMemorySessionSections } from '@/lib/case-study-vault-memory-session-sections'
import { homePageSections } from '@/lib/home-page-sections'

import '@/styles/tailwind.css'

/** No runtime filesystem reads — Cloudflare Workers does not implement `fs.readdir`. */
const allSections: Record<string, Array<Section>> = {
  '/': homePageSections,
  '/case-studies/cloudflare-docs-mcp': caseStudyCloudflareDocsSections,
  '/case-studies/vault-memory-github-session-2026-04':
    caseStudyVaultMemorySessionSections,
}

export const metadata: Metadata = {
  metadataBase: getSiteOrigin(),
  title: {
    template: '%s - ClawQL',
    default: 'ClawQL',
  },
  description:
    'ClawQL is an MCP server for OpenAPI and Google APIs: search and execute tools, optional sandbox and Obsidian memory tools, internal GraphQL projection, stdio or Streamable HTTP or optional gRPC (mcp-grpc-transport), Docker and Kubernetes.',
  openGraph: {
    type: 'website',
    siteName: 'ClawQL',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary',
  },
  icons: {
    icon: [{ url: '/ClawQL-logo.jpeg', type: 'image/jpeg' }],
    apple: [{ url: '/ClawQL-logo.jpeg', type: 'image/jpeg' }],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="flex min-h-full overflow-x-hidden bg-claw-warm-white antialiased dark:bg-claw-bg">
        <Providers>
          <div className="w-full">
            <Layout allSections={allSections}>{children}</Layout>
          </div>
        </Providers>
      </body>
    </html>
  )
}
