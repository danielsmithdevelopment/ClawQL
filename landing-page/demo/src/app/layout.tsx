import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { ClawQLLogo } from '@/components/elements/clawql-logo'
import { Main } from '@/components/elements/main'
import { NavbarIndustriesMenu } from '@/components/elements/navbar-industries-menu'
import { GitHubIcon } from '@/components/icons/social/github-icon'
import { XIcon } from '@/components/icons/social/x-icon'
import {
  FooterCategory,
  FooterLink,
  FooterWithNewsletterFormCategoriesAndSocialIcons,
  NewsletterForm,
  SocialLink,
} from '@/components/sections/footer-with-newsletter-form-categories-and-social-icons'
import {
  NavbarLink,
  NavbarLogo,
  NavbarWithLinksActionsAndCenteredLogo,
} from '@/components/sections/navbar-with-links-actions-and-centered-logo'
import { ClawqlAnalyticsPageview } from '@/components/analytics/ClawqlAnalyticsPageview'
import { SiteStructuredData } from '@/components/SiteStructuredData'
import { WebMcpRegister } from '@/components/WebMcpRegister'
import { DEFAULT_OG_IMAGE_ALT, DEFAULT_OG_IMAGE_HEIGHT, DEFAULT_OG_IMAGE_PATH, DEFAULT_OG_IMAGE_WIDTH } from '@/lib/seo'
import { site } from '@/lib/site'
import { getSiteOrigin } from '@/lib/site-url'
import type { Metadata, Viewport } from 'next'
import './globals.css'

const defaultTitle = 'ClawQL — Agentic Infrastructure for Regulated Industries'

export const metadata: Metadata = {
  metadataBase: getSiteOrigin(),
  title: {
    default: defaultTitle,
    template: '%s · ClawQL',
  },
  description: site.description,
  applicationName: 'ClawQL',
  authors: [{ name: 'ClawQL', url: site.urls.github }],
  creator: 'ClawQL',
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
    title: defaultTitle,
    description: site.description,
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
    title: defaultTitle,
    description: site.description,
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Mona+Sans:ital,wdth,wght@0,112.5,200..900;1,112.5,200..900&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-mist-950 focus:px-4 focus:py-2 focus:text-white"
          >
            Skip to main content
          </a>
          <SiteStructuredData />
          <ClawqlAnalyticsPageview site="marketing" />
          <WebMcpRegister />
          <NavbarWithLinksActionsAndCenteredLogo
            id="navbar"
            links={
              <>
                <NavbarLink href={site.urls.protocolFabric}>Fabric</NavbarLink>
                <NavbarLink href="/#autonomous" className="max-lg:hidden">
                  Autonomous
                </NavbarLink>
                <NavbarLink href={site.urls.agents}>Agents</NavbarLink>
                <NavbarLink href={site.urls.idp}>IDP</NavbarLink>
                <NavbarLink href={site.urls.streams} className="max-lg:hidden">
                  Streams
                </NavbarLink>
                <NavbarIndustriesMenu />
                <NavbarLink href="/#security">Security</NavbarLink>
                <NavbarLink href={site.urls.pricing}>Pricing</NavbarLink>
                <NavbarLink href={site.urls.demo} className="max-lg:hidden">
                  Demo
                </NavbarLink>
                <NavbarLink href={site.urls.docs}>Docs</NavbarLink>
                <NavbarLink href={site.urls.signup} className="sm:hidden">
                  Sign up
                </NavbarLink>
              </>
            }
            logo={
              <NavbarLogo href="/">
                <ClawQLLogo />
              </NavbarLogo>
            }
            actions={
              <>
                <PlainButtonLink href={site.urls.github} className="max-sm:hidden">
                  GitHub
                </PlainButtonLink>
                <ButtonLink href={site.urls.signup}>Get started</ButtonLink>
              </>
            }
          />

          <Main id="main-content">{children}</Main>

          <FooterWithNewsletterFormCategoriesAndSocialIcons
            id="footer"
            cta={
              <NewsletterForm
                headline="Early access waitlist"
                subheadline={
                  <p>
                    {site.earlyAccess.summary} {site.waitlistPromise}
                  </p>
                }
                source="footer"
              />
            }
            links={
              <>
                <FooterCategory title="Product">
                  <FooterLink href={site.urls.protocolFabric}>Protocol Fabric</FooterLink>
                  <FooterLink href="/#autonomous">Autonomous agents</FooterLink>
                  <FooterLink href="/#proof">OpenBench proof</FooterLink>
                  <FooterLink href="/#tools">Core tools</FooterLink>
                  <FooterLink href={site.urls.agents}>Agents</FooterLink>
                  <FooterLink href={site.urls.idp}>IDP</FooterLink>
                  <FooterLink href={site.urls.streams}>Streams</FooterLink>
                  <FooterLink href="/#security">Security</FooterLink>
                  <FooterLink href={site.urls.pricing}>Pricing</FooterLink>
                  <FooterLink href={site.urls.demo}>Interactive demo</FooterLink>
                  <FooterLink href={site.urls.signup}>Sign up</FooterLink>
                  <FooterLink href={site.urls.status}>Status</FooterLink>
                  <FooterLink href={site.urls.docs}>Documentation</FooterLink>
                </FooterCategory>
                <FooterCategory title="Industries">
                  <FooterLink href="/industries/lending">Lending</FooterLink>
                  <FooterLink href="/industries/real-estate">Real estate</FooterLink>
                  <FooterLink href="/industries/surveillance">Surveillance</FooterLink>
                  <FooterLink href="/industries/government">Government</FooterLink>
                  <FooterLink href="/industries/healthcare">Healthcare</FooterLink>
                  <FooterLink href="/industries/legal">Legal</FooterLink>
                  <FooterLink href="/industries/insurance">Insurance</FooterLink>
                  <FooterLink href="/industries/education">Education</FooterLink>
                  <FooterLink href="/industries">All industries</FooterLink>
                </FooterCategory>
                <FooterCategory title="Developers">
                  <FooterLink href={site.urls.github}>GitHub</FooterLink>
                  <FooterLink href={site.urls.npm}>npm package</FooterLink>
                  <FooterLink href={site.urls.releases}>Changelog & releases</FooterLink>
                  <FooterLink href={`${site.urls.docs}/getting-started`}>Quick start</FooterLink>
                  <FooterLink href={`${site.urls.docs}/security`}>Security</FooterLink>
                  <FooterLink href={`${site.urls.docs}/tools`}>MCP tools</FooterLink>
                </FooterCategory>
                <FooterCategory title="Company">
                  <FooterLink href={site.urls.about}>About</FooterLink>
                  <FooterLink href={site.urls.inferenceGtm}>Inference GTM</FooterLink>
                  <FooterLink href={site.urls.idpGtm}>IDP GTM</FooterLink>
                  <FooterLink href={site.urls.enterpriseGtm}>Enterprise GTM</FooterLink>
                  <FooterLink href={site.urls.contact}>Contact</FooterLink>
                </FooterCategory>
                <FooterCategory title="Legal">
                  <FooterLink href={site.urls.privacy}>Privacy Policy</FooterLink>
                </FooterCategory>
              </>
            }
            fineprint={`© ${new Date().getFullYear()} ClawQL`}
            socialLinks={
              <>
                <SocialLink href={site.urls.github} name="GitHub">
                  <GitHubIcon />
                </SocialLink>
                <SocialLink href={site.urls.twitter} name="X">
                  <XIcon />
                </SocialLink>
              </>
            }
          />
        </>
      </body>
    </html>
  )
}
