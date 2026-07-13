import { JsonLd } from '@/components/JsonLd'
import { getSiteOrigin } from '@/lib/site-url'

/**
 * Sitewide schema.org graph: Organization, WebSite, SoftwareSourceCode (project).
 * Helps search engines understand the product and canonical site URL.
 */
export function SiteStructuredData() {
  const origin = getSiteOrigin().origin.replace(/\/$/, '')
  const logo = `${origin}/ClawQL-logo.jpeg`

  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: 'ClawQL',
        url: origin,
        logo: { '@type': 'ImageObject', url: logo },
        sameAs: ['https://github.com/danielsmithdevelopment/ClawQL'],
      },
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        name: 'ClawQL documentation',
        url: origin,
        inLanguage: 'en-US',
        publisher: { '@id': `${origin}/#organization` },
      },
      {
        '@type': 'SoftwareSourceCode',
        name: 'ClawQL MCP',
        description:
          'MCP server for OpenAPI 3, Swagger 2, and Google Discovery: search and execute tools, optional sandbox and Obsidian memory, GraphQL projection, stdio or HTTP or gRPC.',
        codeRepository: 'https://github.com/danielsmithdevelopment/ClawQL',
        programmingLanguage: ['TypeScript'],
        license:
          'https://github.com/danielsmithdevelopment/ClawQL/blob/main/LICENSE',
        url: origin,
        isAccessibleForFree: true,
      },
    ],
  }

  return <JsonLd data={data} />
}
