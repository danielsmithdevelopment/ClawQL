export const site = {
  name: 'ClawQL',
  title: 'ClawQL documentation',
  description:
    'ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI — MCP, inference, and Zero-Trust Agentic Fabric docs.',
  github: 'https://github.com/danielsmithdevelopment/ClawQL',
  marketing: 'https://clawql.com',
} as const

export function getSiteOrigin(): string {
  return (
    import.meta.env.PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    'https://docs.clawql.com'
  )
}
