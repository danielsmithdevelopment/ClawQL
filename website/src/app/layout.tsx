import { type Metadata, type Viewport } from 'next'

import { Providers } from '@/app/providers'
import { WebMcpRegister } from '@/components/WebMcpRegister'
import { Layout } from '@/components/Layout'
import { type Section } from '@/components/SectionProvider'
import { SiteStructuredData } from '@/components/SiteStructuredData'
import { getSiteOrigin } from '@/lib/site-url'

import { caseStudyCloudflareDocsSections } from '@/lib/case-study-cloudflare-docs-sections'
import { caseStudyCrossThreadVaultRecallSections } from '@/lib/case-study-cross-thread-vault-recall-sections'
import { caseStudyVaultMemorySessionSections } from '@/lib/case-study-vault-memory-session-sections'
import { homePageSections } from '@/lib/home-page-sections'

import '@/styles/tailwind.css'

/** No runtime filesystem reads — Cloudflare Workers does not implement `fs.readdir`. */
const allSections: Record<string, Array<Section>> = {
  '/': homePageSections,
  '/case-studies/cloudflare-docs-mcp': caseStudyCloudflareDocsSections,
  '/case-studies/vault-memory-github-session-2026-04':
    caseStudyVaultMemorySessionSections,
  '/case-studies/cross-thread-vault-recall':
    caseStudyCrossThreadVaultRecallSections,
}

export const metadata: Metadata = {
  metadataBase: getSiteOrigin(),
  title: {
    template: '%s - ClawQL',
    default: 'ClawQL documentation',
  },
  description:
    'ClawQL is an MCP server for OpenAPI and Google APIs: search and execute tools, optional sandbox and Obsidian memory tools, internal GraphQL projection, stdio or Streamable HTTP or optional gRPC (mcp-grpc-transport), Docker and Kubernetes.',
  applicationName: 'ClawQL',
  authors: [
    { name: 'ClawQL', url: 'https://github.com/danielsmithdevelopment/ClawQL' },
  ],
  creator: 'ClawQL',
  manifest: '/site.webmanifest',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    siteName: 'ClawQL',
    locale: 'en_US',
    images: [
      {
        url: '/ClawQL-logo.jpeg',
        alt: 'ClawQL — MCP server for OpenAPI, Swagger, and Google Discovery APIs',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
  },
  icons: {
    icon: [{ url: '/ClawQL-logo.jpeg', type: 'image/jpeg' }],
    apple: [{ url: '/ClawQL-logo.jpeg', type: 'image/jpeg' }],
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f5' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1419' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="flex min-h-full overflow-x-hidden bg-claw-warm-white antialiased dark:bg-claw-bg">
        <SiteStructuredData />
        <Providers>
          <WebMcpRegister />
          <div className="w-full">
            <Layout allSections={allSections}>{children}</Layout>
          </div>
        </Providers>
      </body>
    </html>
  )
}
