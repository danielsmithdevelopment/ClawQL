/**
 * Agent-readiness discovery documents for clawql.com (isitagentready.com checks).
 */

import { site } from '@/lib/site'
import { getSiteOriginString } from '@/lib/site-url'

const SERVER_CARD_SCHEMA =
  'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json'

const AGENT_SKILLS_SCHEMA =
  'https://schemas.agentskills.io/discovery/0.2.0/schema.json'

const GOOGLE_OIDC_BASE: Record<string, unknown> = {
  issuer: 'https://accounts.google.com',
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  device_authorization_endpoint: 'https://oauth2.googleapis.com/device/code',
  token_endpoint: 'https://oauth2.googleapis.com/token',
  userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
  revocation_endpoint: 'https://oauth2.googleapis.com/revoke',
  jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
  response_types_supported: [
    'code',
    'token',
    'id_token',
    'code token',
    'code id_token',
    'token id_token',
    'code token id_token',
    'none',
  ],
  response_modes_supported: ['query', 'fragment', 'form_post'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['RS256'],
  scopes_supported: ['openid', 'email', 'profile'],
  token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
  claims_supported: [
    'aud',
    'email',
    'email_verified',
    'exp',
    'family_name',
    'given_name',
    'iat',
    'iss',
    'name',
    'picture',
    'sub',
  ],
  code_challenge_methods_supported: ['plain', 'S256'],
  grant_types_supported: [
    'authorization_code',
    'refresh_token',
    'urn:ietf:params:oauth:grant-type:device_code',
    'urn:ietf:params:oauth:grant-type:jwt-bearer',
  ],
  authorization_response_iss_parameter_supported: true,
}

export const CONTENT_SIGNAL = 'Content-Signal: ai-train=no, search=yes, ai-input=no'

const ROBOTS_RULES: Array<{
  userAgent: string | string[]
  allow?: string | string[]
}> = [
  { userAgent: '*', allow: '/' },
  { userAgent: 'GPTBot', allow: '/' },
  { userAgent: 'ChatGPT-User', allow: '/' },
  { userAgent: 'Google-Extended', allow: '/' },
  { userAgent: 'ClaudeBot', allow: '/' },
  { userAgent: 'Claude-Web', allow: '/' },
  { userAgent: 'anthropic-ai', allow: '/' },
  { userAgent: 'PerplexityBot', allow: '/' },
  { userAgent: 'Applebot-Extended', allow: '/' },
]

function resolveArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

export function buildRobotsTxt(origin = getSiteOriginString()): string {
  const sitemap = `${origin}/sitemap.xml`
  let content = ''

  for (const rule of ROBOTS_RULES) {
    for (const agent of resolveArray(rule.userAgent)) {
      content += `User-Agent: ${agent}\n`
    }
    content += `${CONTENT_SIGNAL}\n`
    for (const item of resolveArray(rule.allow)) {
      content += `Allow: ${item}\n`
    }
    content += '\n'
  }

  content += `Sitemap: ${sitemap}\n`
  return content
}

export function getApiCatalogLinkset(origin = getSiteOriginString()): {
  linkset: Array<Record<string, unknown>>
} {
  const docs = site.urls.docs.replace(/\/$/, '')

  return {
    linkset: [
      {
        anchor: `${origin}/`,
        'service-desc': [
          {
            href: `${docs}/.well-known/mcp/server-card.json`,
            type: 'application/json',
          },
        ],
        'service-doc': [
          { href: docs, type: 'text/html' },
          { href: `${docs}/getting-started`, type: 'text/html' },
        ],
        status: [{ href: `${docs}/api/health`, type: 'application/json' }],
        describedby: [{ href: `${origin}/auth.md`, type: 'text/markdown' }],
      },
    ],
  }
}

export function getMcpServerCard(origin = getSiteOriginString()): Record<string, unknown> {
  const docs = site.urls.docs.replace(/\/$/, '')

  return {
    $schema: SERVER_CARD_SCHEMA,
    name: 'io.github.danielsmithdevelopment/clawql-mcp',
    version: '6.0.0',
    description:
      'MCP server: search + execute any OpenAPI 3 API with an internal GraphQL optimization layer',
    title: 'ClawQL',
    websiteUrl: origin,
    repository: {
      type: 'git',
      url: 'https://github.com/danielsmithdevelopment/ClawQL.git',
    },
    serverInfo: {
      name: 'clawql-mcp',
      version: '6.0.0',
    },
    capabilities: {
      tools: { listChanged: true },
      resources: {},
      prompts: {},
    },
    remotes: [
      {
        type: 'streamable-http',
        url: `${docs}/mcp`,
        supportedProtocolVersions: ['2025-03-12', '2025-06-18', '2025-11-25'],
      },
    ],
  }
}

export function getOpenIdConfiguration(): Record<string, unknown> {
  return { ...GOOGLE_OIDC_BASE }
}

export function getOAuthAuthorizationServerMetadata(): Record<string, unknown> {
  const oidc = getOpenIdConfiguration()
  return {
    issuer: oidc.issuer,
    authorization_endpoint: oidc.authorization_endpoint,
    token_endpoint: oidc.token_endpoint,
    jwks_uri: oidc.jwks_uri,
    revocation_endpoint: oidc.revocation_endpoint,
    device_authorization_endpoint: oidc.device_authorization_endpoint,
    scopes_supported: oidc.scopes_supported,
    response_types_supported: oidc.response_types_supported,
    grant_types_supported: oidc.grant_types_supported,
    token_endpoint_auth_methods_supported: oidc.token_endpoint_auth_methods_supported,
    code_challenge_methods_supported: oidc.code_challenge_methods_supported,
  }
}

export function getOAuthProtectedResourceMetadata(origin = getSiteOriginString()): Record<string, unknown> {
  const oidc = getOpenIdConfiguration()
  const docs = site.urls.docs.replace(/\/$/, '')

  return {
    resource: origin,
    authorization_servers: [String(oidc.issuer)],
    scopes_supported: oidc.scopes_supported,
    bearer_methods_supported: ['header'],
    resource_name: 'ClawQL',
    resource_documentation: `${docs}/spec-configuration`,
  }
}

export function getA2aAgentCard(origin = getSiteOriginString()): Record<string, unknown> {
  const docs = site.urls.docs.replace(/\/$/, '')

  return {
    name: 'ClawQL',
    description:
      'Operating system for agents — MCP search, execute, vault memory, and optional IDP document pipelines.',
    version: '6.0.0',
    url: `${docs}/mcp`,
    provider: {
      organization: 'ClawQL',
      url: origin,
    },
    capabilities: {
      streaming: true,
      pushNotifications: false,
    },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: [
      {
        id: 'search-execute',
        name: 'Search and execute APIs',
        description:
          'Discover operationIds with search, then run validated execute calls against OpenAPI, GraphQL, and gRPC providers.',
        tags: ['mcp', 'openapi', 'graphql', 'grpc'],
        examples: ['List Cloudflare zones', 'Create a Linear issue from vault context'],
      },
      {
        id: 'vault-memory',
        name: 'Vault memory recall and ingest',
        description: 'Persist and recall durable session context in an Obsidian-compatible vault.',
        tags: ['memory', 'obsidian', 'vault'],
        examples: ['Recall prior debugging notes', 'Ingest a decision after a deploy'],
      },
    ],
    documentationUrl: docs,
    securitySchemes: {
      bearer: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    security: [{ bearer: [] }],
  }
}

export function getAgentSkillsIndex(origin = getSiteOriginString()): Record<string, unknown> {
  const docs = site.urls.docs.replace(/\/$/, '')

  return {
    $schema: AGENT_SKILLS_SCHEMA,
    skills: [
      {
        name: 'clawql-search-workflows',
        type: 'skill-md',
        description: 'Use ClawQL search to discover correct operationIds before execute calls.',
        url: `${docs}/.well-known/agent-skills/clawql-search-workflows/SKILL.md`,
      },
      {
        name: 'clawql-execute-workflows',
        type: 'skill-md',
        description: 'Execute discovered API operations safely with argument validation.',
        url: `${docs}/.well-known/agent-skills/clawql-execute-workflows/SKILL.md`,
      },
      {
        name: 'clawql-vault-memory',
        type: 'skill-md',
        description: 'Persist durable outcomes with memory_ingest and recall with memory_recall.',
        url: `${docs}/.well-known/agent-skills/clawql-vault-memory/SKILL.md`,
      },
    ],
  }
}

export function buildAuthMd(origin = getSiteOriginString()): string {
  const docs = site.urls.docs.replace(/\/$/, '')

  return `# auth.md

Agent authentication and registration discovery for **${origin}**.

ClawQL is an MCP platform. Production MCP Streamable HTTP is hosted at **${docs}/mcp**. This marketing site publishes discovery metadata; credentials are issued by the configured OAuth authorization server.

## Audience

- Software agents connecting to ClawQL MCP tools (\`search\`, \`execute\`, \`memory_*\`, optional IDP tools).
- Human operators provisioning API tokens for upstream providers (Google, Cloudflare, GitHub, etc.).

## OAuth Protected Resource

- Protected resource metadata: \`${origin}/.well-known/oauth-protected-resource\`
- Resource identifier: \`${origin}\`
- Authorization server: \`https://accounts.google.com\` (Google OIDC — used for upstream API tokens in self-hosted and hosted deployments).
- Bearer methods: \`header\`

## Authorization server metadata

- \`${origin}/.well-known/oauth-authorization-server\`
- \`${origin}/.well-known/openid-configuration\`

## Agent registration

Hosted ClawQL accounts: start at [${origin}/signup/](${origin}/signup/) (14-day Developer trial). Self-hosted operators install via \`npm install -g clawql-mcp\` and configure MCP in Cursor, Claude, or other MCP clients — see [${docs}/getting-started](${docs}/getting-started).

\`\`\`json
{
  "agent_auth": {
    "skill": "clawql-mcp-client",
    "register_uri": "${origin}/signup/",
    "methods": [
      {
        "type": "human_provisioning",
        "description": "Operator creates account or self-hosts; MCP URL and tokens configured in the client."
      }
    ],
    "identity_types_supported": ["anonymous", "identity_assertion"],
    "identity_assertion": {
      "assertion_types_supported": [
        "urn:ietf:params:oauth:token-type:id-jag",
        "verified_email"
      ],
      "credential_types_supported": ["bearer"]
    }
  }
}
\`\`\`

## Documentation

- MCP tools reference: [${docs}/tools](${docs}/tools)
- MCP Server Card: [${origin}/.well-known/mcp/server-card.json](${origin}/.well-known/mcp/server-card.json)
`
}

export function buildHomeMarkdown(origin = getSiteOriginString()): string {
  const docs = site.urls.docs.replace(/\/$/, '')

  return `# ClawQL — MCP for API discovery and execution

${site.description}

## Product summary

${site.earlyAccess.summary}

## Install

\`\`\`bash
${site.installCommand}
\`\`\`

## Key links

- Documentation: ${docs}
- Getting started: ${docs}/getting-started
- GitHub: ${site.urls.github}
- Sign up: ${origin}/signup/
- Pricing: ${origin}/pricing/

## MCP tool tiers

ClawQL exposes tiered MCP tools (search, execute, memory, optional IDP and enterprise modules). See the homepage sections **Tools**, **Workflows**, **IDP**, and **Security** for the full marketing overview.

## Agent discovery on this site

- robots.txt and sitemap.xml for crawlers
- \`/.well-known/mcp/server-card.json\` — MCP Server Card
- \`/.well-known/agent-card.json\` — A2A Agent Card
- \`/.well-known/agent-skills/index.json\` — Agent Skills index
- \`/.well-known/api-catalog\` — RFC 9727 API catalog
- \`/auth.md\` — Auth.md registration discovery
`
}

/** Paths exported in agent-markdown.json for Accept: text/markdown negotiation. */
export function getAgentMarkdownMap(origin = getSiteOriginString()): Record<string, string> {
  return {
    '/': buildHomeMarkdown(origin),
    '/pricing': `# Pricing\n\nClawQL pricing — self-host free on Apache 2.0 or start a 14-day Developer trial.\n\nSee ${origin}/pricing/ for tier details.`,
    '/about': `# About ClawQL\n\nClawQL is an operating system for agents.\n\nSee ${origin}/about/ for mission and ecosystem overview.`,
    '/signup': `# Sign up\n\nStart a 14-day Developer trial or join the waitlist.\n\n${origin}/signup/`,
    '/privacy-policy': `# Privacy Policy\n\nSee ${origin}/privacy-policy/ for the full policy.`,
    '/industries': `# Industries\n\nVertical workflows for lending, real estate, healthcare, legal, insurance, and education.\n\n${origin}/industries/`,
  }
}

export function getLinkHeaderValue(origin = getSiteOriginString()): string {
  const docs = site.urls.docs.replace(/\/$/, '')

  return [
    `<${origin}/sitemap.xml>; rel="sitemap"`,
    `</.well-known/api-catalog>; rel="api-catalog"`,
    `</.well-known/mcp/server-card.json>; rel="service-desc"`,
    `<${docs}>; rel="service-doc"`,
    `</auth.md>; rel="describedby"`,
    `<${docs}/api/health>; rel="status"`,
  ].join(', ')
}
