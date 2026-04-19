/**
 * MCP Server Card (SEP / PR #2127) for `/.well-known/mcp/server-card.json`.
 * @see https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127
 */
import clawqlPkg from '../../../package.json'

import { getSiteOrigin } from '@/lib/site-url'

function envString(key: string): string | undefined {
  const v = process.env[key]
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}

/** JSON Schema URI from MCP Server Card draft (SEP-2127). */
const SERVER_CARD_SCHEMA =
  'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json'

/**
 * Streamable HTTP URL for remote MCP. Defaults to `{site origin}/mcp` when unset — override in
 * production if MCP is hosted elsewhere (docs and MCP are often separate deployments).
 */
function streamableHttpUrl(origin: string): string {
  return (
    envString('NEXT_PUBLIC_MCP_STREAMABLE_HTTP_URL') ??
    envString('MCP_SERVER_CARD_STREAMABLE_HTTP_URL') ??
    `${origin.replace(/\/$/, '')}/mcp`
  )
}

export function getMcpServerCard(): Record<string, unknown> {
  const origin = getSiteOrigin().origin.replace(/\/$/, '')
  const version = String(clawqlPkg.version)
  const implName = 'clawql-mcp'
  const cardName =
    envString('MCP_SERVER_CARD_NAME') ??
    'io.github.danielsmithdevelopment/clawql-mcp'

  return {
    $schema: SERVER_CARD_SCHEMA,
    name: cardName,
    version,
    description: String(clawqlPkg.description ?? ''),
    title: envString('MCP_SERVER_CARD_TITLE') ?? 'ClawQL',
    websiteUrl: envString('MCP_SERVER_CARD_WEBSITE_URL') ?? origin,
    repository: {
      type: 'git',
      url: 'https://github.com/danielsmithdevelopment/ClawQL.git',
    },
    serverInfo: {
      name: implName,
      version,
    },
    capabilities: {
      tools: { listChanged: true },
      resources: {},
      prompts: {},
    },
    remotes: [
      {
        type: 'streamable-http',
        url: streamableHttpUrl(origin),
        supportedProtocolVersions: ['2025-03-12', '2025-06-18', '2025-11-25'],
      },
    ],
  }
}
