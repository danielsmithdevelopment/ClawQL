import { type Metadata, type Viewport } from 'next'

import { Providers } from '@/app/providers'
import { Layout } from '@/components/Layout'
import { SiteStructuredData } from '@/components/SiteStructuredData'
import {
  DEFAULT_OG_IMAGE_ALT,
  DEFAULT_OG_IMAGE_HEIGHT,
  DEFAULT_OG_IMAGE_PATH,
  DEFAULT_OG_IMAGE_WIDTH,
} from '@/lib/seo'
import { getSiteOrigin } from '@/lib/site-url'

import '@/styles/tailwind.css'

const siteDefaultTitle = 'ClawQL documentation'
const siteDefaultDescription =
  'ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI — MCP, inference, and Zero-Trust Agentic Fabric docs.'

export const metadata: Metadata = {
  metadataBase: getSiteOrigin(),
  title: {
    template: '%s - ClawQL',
    default: siteDefaultTitle,
  },
  description: siteDefaultDescription,
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
    title: siteDefaultTitle,
    description: siteDefaultDescription,
    images: [
      {
        url: DEFAULT_OG_IMAGE_PATH,
        width: DEFAULT_OG_IMAGE_WIDTH,
        height: DEFAULT_OG_IMAGE_HEIGHT,
        alt: DEFAULT_OG_IMAGE_ALT,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteDefaultTitle,
    description: siteDefaultDescription,
    images: [DEFAULT_OG_IMAGE_PATH],
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/ClawQL-logo.jpeg', type: 'image/jpeg' },
    ],
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

/** Entire docs site is SSG — required for OpenNext static-assets incremental cache. */
export const dynamic = 'force-static'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="flex min-h-full overflow-x-hidden bg-claw-warm-white antialiased dark:bg-claw-bg">
        {/* Critical fallbacks if hashed CSS is briefly unavailable or delayed */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
.docs-logo-mark{width:2.25rem;height:2.25rem;object-fit:cover;object-position:top;border-radius:0.375rem}
@media (max-width:1023px){
  .docs-desktop-nav{display:none!important}
}
`.trim(),
          }}
        />
        <a
          href="#main-content"
          className="fixed top-0 left-4 z-[100] -translate-y-full rounded-b-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-md transition-transform focus:translate-y-0 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-white dark:bg-claw-cyan dark:text-claw-bg dark:focus:outline-claw-bg"
        >
          Skip to main content
        </a>
        <SiteStructuredData />
        <Providers>
          <div className="w-full">
            <Layout>{children}</Layout>
          </div>
        </Providers>
      </body>
    </html>
  )
}
