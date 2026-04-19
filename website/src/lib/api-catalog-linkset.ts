/**
 * RFC 9727 API catalog document (Linkset / application/linkset+json).
 * @see https://www.rfc-editor.org/rfc/rfc9727
 */
export function getApiCatalogLinkset(origin: string): {
  linkset: Array<Record<string, unknown>>
} {
  const base = origin.replace(/\/$/, '')

  return {
    linkset: [
      {
        anchor: `${base}/`,
        'service-doc': [
          {
            href: `${base}/tools`,
            type: 'text/html',
          },
          {
            href: `${base}/spec-configuration`,
            type: 'text/html',
          },
        ],
        'service-desc': [
          {
            href: 'https://raw.githubusercontent.com/danielsmithdevelopment/ClawQL/main/providers/github/openapi.yaml',
            type: 'application/yaml',
          },
        ],
      },
    ],
  }
}
