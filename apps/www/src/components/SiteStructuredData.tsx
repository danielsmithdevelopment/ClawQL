import { site } from '@/lib/site'
import { getSiteOriginString } from '@/lib/site-url'

const LOGO = '/ClawQL-logo.jpeg'

export function SiteStructuredData() {
  const origin = getSiteOriginString()

  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.name,
    url: origin,
    logo: `${origin}${LOGO}`,
    description: site.description,
    email: 'hello@clawql.com',
    sameAs: [site.urls.github, site.urls.npm, site.urls.twitter],
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'hello@clawql.com',
        url: `${origin}/contact/`,
        availableLanguage: ['English'],
      },
      {
        '@type': 'ContactPoint',
        contactType: 'sales',
        email: 'hello@clawql.com',
        url: `${origin}/signup/`,
      },
    ],
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'US',
      addressLocality: 'Remote',
    },
  }

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    url: origin,
    description: site.description,
    publisher: { '@type': 'Organization', name: site.name, url: origin },
  }

  const software = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'clawql-mcp',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'cross-platform',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Self-host free forever (Apache 2.0). Managed tiers via early access.',
      url: `${origin}/pricing/`,
    },
    downloadUrl: site.urls.npm,
    installUrl: `${origin}/install`,
    softwareVersion: '8.0.0',
    url: origin,
    codeRepository: site.urls.github,
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(software) }}
      />
    </>
  )
}
