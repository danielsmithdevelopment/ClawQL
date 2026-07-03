import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { ClawQLLogo } from '@/components/elements/clawql-logo'
import { Main } from '@/components/elements/main'
import { GitHubIcon } from '@/components/icons/social/github-icon'
import { XIcon } from '@/components/icons/social/x-icon'
import { NavbarIndustriesMenu } from '@/components/elements/navbar-industries-menu'
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
import { site } from '@/lib/site'
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'ClawQL — MCP for API discovery and execution',
    template: '%s · ClawQL',
  },
  description: site.description,
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
          <NavbarWithLinksActionsAndCenteredLogo
            id="navbar"
            links={
              <>
                <NavbarLink href="/#tools">Tools</NavbarLink>
                <NavbarLink href="/#workflows" className="max-lg:hidden">
                  Workflows
                </NavbarLink>
                <NavbarLink href="/#idp">IDP</NavbarLink>
                <NavbarIndustriesMenu />
                <NavbarLink href="/#security">Security</NavbarLink>
                <NavbarLink href={site.urls.pricing}>Pricing</NavbarLink>
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

          <Main>{children}</Main>

          <FooterWithNewsletterFormCategoriesAndSocialIcons
            id="footer"
            cta={
              <NewsletterForm
                headline="Managed accounts waitlist"
                subheadline={
                  <p>
                    Be first to know when ClawQL managed hosting opens — hosted MCP endpoints, vault memory, and
                    bundled providers without running your own cluster.
                  </p>
                }
                source="footer"
              />
            }
            links={
              <>
                <FooterCategory title="Product">
                  <FooterLink href="/#tools">Tools</FooterLink>
                  <FooterLink href="/#workflows">Workflows</FooterLink>
                  <FooterLink href="/#security">Security</FooterLink>
                  <FooterLink href={site.urls.pricing}>Pricing</FooterLink>
                  <FooterLink href={site.urls.signup}>Sign up</FooterLink>
                  <FooterLink href={site.urls.docs}>Documentation</FooterLink>
                </FooterCategory>
                <FooterCategory title="Industries">
                  <FooterLink href="/industries/lending">Lending</FooterLink>
                  <FooterLink href="/industries/real-estate">Real estate</FooterLink>
                  <FooterLink href="/industries/healthcare">Healthcare</FooterLink>
                  <FooterLink href="/industries/legal">Legal</FooterLink>
                  <FooterLink href="/industries/insurance">Insurance</FooterLink>
                  <FooterLink href="/industries/education">Education</FooterLink>
                  <FooterLink href="/industries">All industries</FooterLink>
                </FooterCategory>
                <FooterCategory title="Developers">
                  <FooterLink href={site.urls.github}>GitHub</FooterLink>
                  <FooterLink href={site.urls.npm}>npm package</FooterLink>
                  <FooterLink href={`${site.urls.docs}/readme/getting-started`}>Quick start</FooterLink>
                  <FooterLink href={`${site.urls.docs}/security`}>Security</FooterLink>
                  <FooterLink href={`${site.urls.docs}/mcp/mcp-tools`}>MCP tools</FooterLink>
                </FooterCategory>
                <FooterCategory title="Company">
                  <FooterLink href={site.urls.about}>About</FooterLink>
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
                <SocialLink href="https://x.com" name="X">
                  <XIcon />
                </SocialLink>
                <SocialLink href={site.urls.github} name="GitHub">
                  <GitHubIcon />
                </SocialLink>
              </>
            }
          />
        </>
      </body>
    </html>
  )
}
