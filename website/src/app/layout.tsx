import glob from 'fast-glob'
import { type Metadata } from 'next'

import { Providers } from '@/app/providers'
import { Layout } from '@/components/Layout'
import { type Section } from '@/components/SectionProvider'
import { getSiteOrigin } from '@/lib/site-url'

import '@/styles/tailwind.css'

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let pages = await glob('**/*.mdx', { cwd: 'src/app' })
  let allSectionsEntries = (await Promise.all(
    pages.map(async (filename) => [
      '/' + filename.replace(/(^|\/)page\.mdx$/, ''),
      (await import(`./${filename}`)).sections,
    ]),
  )) as Array<[string, Array<Section>]>
  let allSections = Object.fromEntries(allSectionsEntries)

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
