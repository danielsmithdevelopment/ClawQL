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
    sameAs: [site.urls.github],
  }

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    url: origin,
    description: site.description,
    publisher: { '@type': 'Organization', name: site.name },
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
    </>
  )
}
