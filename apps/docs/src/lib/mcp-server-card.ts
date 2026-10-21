/**
 * MCP Server Card (SEP / PR #2127) for `/.well-known/mcp/server-card.json`.
 * @see https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127
 */

import { getSiteOrigin } from '@/lib/site-url'

function envString(key: string): string | undefined {
  const v = process.env[key]
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}

/** JSON Schema URI from MCP Server Card draft (SEP-2127). */
const SERVER_CARD_SCHEMA =
  'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json'

/**
 * Public Streamable HTTP MCP URL for the server card `remotes` array.
 *
 * Only advertise a remote when an explicit env URL is set. Defaulting to
 * `{docs origin}/mcp` previously published a dead endpoint (404) and failed
 * AgentReady AR-ACT honesty checks — the docs Worker serves documentation, not
 * the product MCP binary. Self-host: `npx -p clawql-mcp clawql-mcp-http`.
 */
function streamableHttpUrl(): string | undefined {
  return (
    envString('NEXT_PUBLIC_MCP_STREAMABLE_HTTP_URL') ??
    envString('MCP_SERVER_CARD_STREAMABLE_HTTP_URL')
  )
}

function clawqlVersion(): string {
  return (
    envString('CLAWQL_PACKAGE_VERSION') ??
    envString('NEXT_PUBLIC_CLAWQL_VERSION') ??
    '0.0.0'
  )
}

function clawqlDescription(): string {
  return (
    envString('CLAWQL_PACKAGE_DESCRIPTION') ??
    'MCP server: search + execute any OpenAPI 3 API with an internal GraphQL optimization layer'
  )
}

export function getMcpServerCard(): Record<string, unknown> {
  const origin = getSiteOrigin().origin.replace(/\/$/, '')
  const version = clawqlVersion()
  const implName = 'clawql-mcp'
  const cardName =
    envString('MCP_SERVER_CARD_NAME') ??
    'io.github.danielsmithdevelopment/clawql-mcp'
  const remoteUrl = streamableHttpUrl()

  const card: Record<string, unknown> = {
    $schema: SERVER_CARD_SCHEMA,
    name: cardName,
    version,
    description: clawqlDescription(),
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
  }

  if (remoteUrl) {
    card.remotes = [
      {
        type: 'streamable-http',
        url: remoteUrl,
        supportedProtocolVersions: [
          '2025-03-12',
          '2025-06-18',
          '2025-11-25',
          '2026-07-28',
        ],
      },
    ]
  }

  return card
}
