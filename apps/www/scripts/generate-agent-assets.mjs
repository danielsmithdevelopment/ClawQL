#!/usr/bin/env node
/**
 * Prebuild: agent-readiness static assets for clawql.com.
 *
 * Run from apps/www/: node scripts/generate-agent-assets.mjs
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '../public')
const repoRoot = path.resolve(__dirname, '../../..')
const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://clawql.com').replace(/\/$/, '')
const docs = 'https://docs.clawql.com'
const VERSION = '8.0.0'
const NPM_PKG = 'clawql-mcp'
const MCP_NAME = 'io.github.danielsmithdevelopment/clawql-mcp'

const CONTENT_SIGNAL = 'Content-Signal: ai-train=no, search=yes, ai-input=no'

const ROBOTS_AGENTS = [
  '*',
  'GPTBot',
  'ChatGPT-User',
  'Google-Extended',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'PerplexityBot',
  'Applebot-Extended',
]

const publicMcpUrl = (
  process.env.NEXT_PUBLIC_MCP_STREAMABLE_HTTP_URL ||
  process.env.MCP_SERVER_CARD_STREAMABLE_HTTP_URL ||
  ''
).trim()

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`)
}

function writeText(filePath, body) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, body.endsWith('\n') ? body : `${body}\n`)
}

function sha256Digest(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`
}

function buildRobotsTxt() {
  let content = ''
  for (const agent of ROBOTS_AGENTS) {
    content += `User-Agent: ${agent}\n${CONTENT_SIGNAL}\nAllow: /\n\n`
  }
  content += `Sitemap: ${origin}/sitemap.xml\n`
  return content
}

function getLinkHeaderValue() {
  return [
    `<${origin}/sitemap.xml>; rel="sitemap"`,
    `</llms.txt>; rel="alternate"; type="text/plain"`,
    `</index.md>; rel="alternate"; type="text/markdown"`,
    `</pricing.md>; rel="alternate"; type="text/markdown"`,
    `</auth.md>; rel="alternate"; type="text/markdown"`,
    `</.well-known/api-catalog>; rel="api-catalog"`,
    `</.well-known/ai-catalog.json>; rel="ai-catalog"; type="application/json"`,
    `</.well-known/ard.json>; rel="ard-catalog"; type="application/json"`,
    `</.well-known/mcp/server-card.json>; rel="service-desc"`,
    `</.well-known/mcp/server.json>; rel="describedby"; type="application/json"`,
    `</.well-known/agent-card.json>; rel="agent-card"; type="application/json"`,
    `</openapi.json>; rel="service-desc"; type="application/openapi+json"`,
    `<${docs}/openapi.json>; rel="service-desc"; type="application/openapi+json"`,
    `</.well-known/payments.json>; rel="payment-method"`,
    `<${docs}>; rel="service-doc"`,
    `</auth.md>; rel="describedby"`,
    `<${docs}/api/health>; rel="status"`,
  ].join(', ')
}

function buildAuthMd() {
  return `# auth.md

Agent authentication and registration discovery for **${origin}**.

ClawQL is an MCP platform. **Self-host Streamable HTTP** with \`npx -p ${NPM_PKG} clawql-mcp-http\` (path \`/mcp\`, OAuth + RFC 9728 when enabled). This marketing site publishes discovery metadata. A public hosted MCP URL appears on the server card **only** when \`NEXT_PUBLIC_MCP_STREAMABLE_HTTP_URL\` is set at build time — \`${docs}/mcp\` is documentation HTML, not the product MCP binary.

## Install (CLI)

\`\`\`bash
npx ${NPM_PKG}
npx -p ${NPM_PKG} clawql-mcp-http
curl -fsSL ${origin}/install | bash
\`\`\`

npm: https://www.npmjs.com/package/${NPM_PKG}
MCP docs: ${docs}/mcp/mcp-tools · Getting started: ${docs}/getting-started
OpenAPI (docs commerce / discovery): ${docs}/openapi.json · Marketing pointer: ${origin}/openapi.json

## Audience

Software agents connecting to ClawQL MCP tools (\`search\`, \`execute\`, \`memory_*\`, optional IDP tools).

## OAuth Protected Resource

- Protected resource metadata: \`${origin}/.well-known/oauth-protected-resource\`
- Resource identifier: \`${origin}\`
- Authorization server: \`https://accounts.google.com\`
- Bearer methods: \`header\`
- PKCE: \`S256\` advertised on authorization-server metadata

## Authorization server metadata

- \`${origin}/.well-known/oauth-authorization-server\`
- \`${origin}/.well-known/openid-configuration\`

## Agent registration

Hosted accounts: [${origin}/signup/](${origin}/signup/) (early access waitlist). Self-hosted: \`npx ${NPM_PKG}\` — see [${docs}/getting-started](${docs}/getting-started).

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
`
}

function buildPricingMd() {
  return `# Pricing · ClawQL

> Open source self-host is free forever (Apache 2.0). Managed tiers share one MCP endpoint URL.

## Open source

- **Self-host:** free forever — Helm chart, GHCR images, no license fee
- **Install:** \`npx ${NPM_PKG}\` or \`curl -fsSL ${origin}/install | bash\`
- **npm:** https://www.npmjs.com/package/${NPM_PKG}

## Managed (early access)

- Request access: ${origin}/signup/
- Gateway tiers include vault memory; Teams adds Onyx
- IDP tiers (Starter from $299/mo) activate document processing on a dedicated tenant
- Same MCP URL when you upgrade

## What agents should know

- Plans, free tier, and limits are also on the HTML page: ${origin}/pricing/
- Technical docs: ${docs}/getting-started
- Full HTML pricing (authoritative for humans): ${origin}/pricing/

See also: ${origin}/llms.txt · ${docs}/llms.txt
`
}

function buildHomeMd() {
  return `# ClawQL — Agentic Infrastructure for Regulated Industries

ClawQL is agentic infrastructure for production work in regulated industries — Protocol Fabric (anything to MCP to anything), Streams, structured memory, and TEE-ready WORM audit. Self-host free on Apache 2.0 or request early access.

## Install (official CLI)

\`\`\`bash
npx ${NPM_PKG}
\`\`\`

Streamable HTTP (self-host):

\`\`\`bash
npx -p ${NPM_PKG} clawql-mcp-http
\`\`\`

One-line installer: \`curl -fsSL ${origin}/install | bash\`

## Act surfaces

- MCP server package: \`${NPM_PKG}\` (stdio + HTTP)
- Server card: ${origin}/.well-known/mcp/server-card.json
- Registry server.json: ${origin}/.well-known/mcp/server.json
- OpenAPI pointer: ${origin}/openapi.json → ${docs}/openapi.json
- Skills index: ${origin}/.well-known/agent-skills/index.json

## Links

- Documentation: ${docs}
- Getting started: ${docs}/getting-started
- Pricing: ${origin}/pricing/ · ${origin}/pricing.md
- Benchmarks: ${origin}/benchmarks/
- Contact: ${origin}/contact/ · mailto:hello@clawql.com
- Sign up: ${origin}/signup/
- Agents: ${origin}/agents/
- Streams (Protocol Fabric): ${origin}/streams/
- Security: ${origin}/security/
- GitHub: https://github.com/danielsmithdevelopment/ClawQL
- npm: https://www.npmjs.com/package/${NPM_PKG}
`
}

function buildContactMd() {
  return `# Contact · ClawQL

Email: [hello@clawql.com](mailto:hello@clawql.com)

- Product / early access: ${origin}/signup/
- Security: see ${origin}/security/ and ${docs}/security
- Docs: ${docs}
- GitHub issues: https://github.com/danielsmithdevelopment/ClawQL/issues

Postal / legal correspondence is handled via email for early-access operations. There is no public walk-in office.
`
}

function getAgentMarkdownMap() {
  const pricing = buildPricingMd()
  const home = buildHomeMd()
  const contact = buildContactMd()
  return {
    '/': home,
    '/index': home,
    '/pricing': pricing,
    '/contact': contact,
    '/about': `# About · ClawQL\n\nClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI — Regional Hubs, Dedicated Virtual Gateways, and Edge swarm.\n\nSee ${origin}/about/.\n\nContact: ${origin}/contact/ · hello@clawql.com\n`,
    '/benchmarks': `# Benchmarks · ClawQL\n\nEqual-arm multi-gateway and Cloudflare multiturn boards live at ${origin}/benchmarks/.\n\nDurability and kill-mid-write evidence: ${docs}/benchmarks/durability-proof/STATUS\n`,
    '/agents': `# Agentic Platform · ClawQL\n\nStreams + ontology + /mcp-ui + TEE. See ${origin}/agents/.\n`,
    '/streams': `# ClawQL Streams\n\nEvent-driven agents + Protocol Fabric (Core + mcp-api-adapter). Fabric: ${origin}/streams/#fabric\n\nDocs: ${docs}/streams/clawql-streams · ${docs}/mcp/protocol-fabric\n`,
    '/security': `# ClawQL Security\n\nDefense-in-depth for agentic production. See ${origin}/security/.\n\nDocs: ${docs}/security\n`,
    '/idp': `# Intelligent Document Processing\n\nSee ${origin}/idp/.\n`,
    '/inference/gtm': `# Inference-first GTM playbook\n\nSee ${origin}/inference/gtm/.\n`,
    '/enterprise/gtm': `# Enterprise GTM playbook\n\nSee ${origin}/enterprise/gtm/.\n`,
    '/signup': `# Sign up\n\n${origin}/signup/\n`,
    '/privacy-policy': `# Privacy Policy\n\n${origin}/privacy-policy/\n\nContact: hello@clawql.com\n`,
    '/industries': `# Industries\n\n${origin}/industries/\n`,
    '/status': `# Status\n\n${origin}/status/\n`,
    '/auth': buildAuthMd(),
    '/404': `# Not found\n\nThe requested path was not found on ${origin}.\n\nTry: [home](${origin}/) · [docs](${docs}) · [llms.txt](${origin}/llms.txt) · [sitemap](${origin}/sitemap.xml)\n`,
  }
}

function buildSkillsIndex() {
  const skillSpecs = [
    {
      dir: 'clawql-search-workflows',
      name: 'clawql-search-workflows',
      description: 'Use ClawQL search to discover correct operationIds before execute calls.',
    },
    {
      dir: 'clawql-execute-workflows',
      name: 'clawql-execute-workflows',
      description: 'Execute discovered API operations safely with argument validation.',
    },
    {
      dir: 'clawql-vault-memory',
      name: 'clawql-vault-memory',
      description: 'Persist durable outcomes with memory_ingest and recall with memory_recall.',
    },
  ]

  const skills = []
  for (const spec of skillSpecs) {
    const skillPath = path.join(repoRoot, '.cursor/skills', spec.dir, 'SKILL.md')
    let digest
    if (fs.existsSync(skillPath)) {
      digest = sha256Digest(fs.readFileSync(skillPath))
    }
    const entry = {
      name: spec.name,
      type: 'skill-md',
      description: spec.description,
      url: `${docs}/.well-known/agent-skills/${spec.dir}/SKILL.md`,
    }
    if (digest) entry.digest = digest
    skills.push(entry)
  }

  return {
    $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    skills,
  }
}

const googleOidc = {
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

const markdownMap = getAgentMarkdownMap()
const pricingMd = buildPricingMd()
const homeMd = buildHomeMd()
const contactMd = buildContactMd()
const authMd = buildAuthMd()

writeText(path.join(publicDir, 'robots.txt'), buildRobotsTxt())
writeText(path.join(publicDir, 'auth.md'), authMd)
writeText(path.join(publicDir, 'pricing.md'), pricingMd)
writeText(path.join(publicDir, 'index.md'), homeMd)
writeText(path.join(publicDir, 'contact.md'), contactMd)
writeJson(path.join(publicDir, 'agent-markdown.json'), markdownMap)

const serverCard = {
  $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
  name: MCP_NAME,
  version: VERSION,
  description:
    'Agentic Gateway / Protocol Fabric MCP — search, execute, skills, vault memory. Install: npx clawql-mcp; HTTP: npx -p clawql-mcp clawql-mcp-http.',
  title: 'ClawQL',
  websiteUrl: origin,
  repository: {
    type: 'git',
    url: 'https://github.com/danielsmithdevelopment/ClawQL.git',
  },
  serverInfo: { name: NPM_PKG, version: VERSION },
  capabilities: { tools: { listChanged: true }, resources: {}, prompts: {} },
}
if (publicMcpUrl) {
  serverCard.remotes = [
    {
      type: 'streamable-http',
      url: publicMcpUrl,
      supportedProtocolVersions: ['2025-03-12', '2025-06-18', '2025-11-25', '2026-07-28'],
    },
  ]
}
writeJson(path.join(publicDir, '.well-known/mcp/server-card.json'), serverCard)

const serverJson = {
  $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
  name: MCP_NAME,
  title: 'ClawQL',
  description: 'OpenAPI/Discovery → MCP search + execute with optional vault memory and governance.',
  websiteUrl: origin,
  repository: {
    url: 'https://github.com/danielsmithdevelopment/ClawQL',
    source: 'github',
  },
  version: VERSION,
  packages: [
    {
      registryType: 'npm',
      registryBaseUrl: 'https://registry.npmjs.org',
      identifier: NPM_PKG,
      version: VERSION,
      transport: { type: 'stdio' },
    },
    {
      registryType: 'npm',
      registryBaseUrl: 'https://registry.npmjs.org',
      identifier: NPM_PKG,
      version: VERSION,
      transport: { type: 'streamable-http', url: 'http://127.0.0.1:8080/mcp' },
    },
  ],
}
if (publicMcpUrl) {
  serverJson.remotes = [{ type: 'streamable-http', url: publicMcpUrl }]
}
writeJson(path.join(publicDir, '.well-known/mcp/server.json'), serverJson)
// Root convenience copy scanners sometimes probe
writeJson(path.join(publicDir, 'server.json'), serverJson)

writeJson(path.join(publicDir, '.well-known/agent-card.json'), {
  name: 'ClawQL',
  description:
    'Agentic Gateway for Auditable Production AI — MCP search, execute, vault memory, optional IDP, and agentic commerce discovery.',
  version: VERSION,
  url: `${docs}/getting-started`,
  provider: { organization: 'ClawQL', url: origin },
  capabilities: {
    streaming: true,
    pushNotifications: false,
    extensions: [
      {
        uri: 'https://github.com/google-agentic-commerce/ap2/tree/v0.1',
        description:
          'ClawQL marketing-site commerce discovery — merchant role; live adapters on self-hosted ClawQL / docs stubs.',
        params: { roles: ['merchant'] },
      },
    ],
  },
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['text/plain', 'application/json'],
  skills: [
    {
      id: 'search-execute',
      name: 'Search and execute APIs',
      description: 'Discover operationIds with search, then run validated execute calls.',
      tags: ['mcp', 'openapi'],
      examples: ['List Cloudflare zones'],
    },
  ],
  skillsUrl: `${origin}/.well-known/agent-skills/index.json`,
  documentationUrl: docs,
  securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
  security: [{ bearer: [] }],
})

writeJson(path.join(publicDir, '.well-known/agent-skills/index.json'), buildSkillsIndex())

writeJson(path.join(publicDir, '.well-known/api-catalog'), {
  linkset: [
    {
      anchor: `${origin}/`,
      'service-desc': [
        { href: `${origin}/.well-known/mcp/server-card.json`, type: 'application/json' },
        { href: `${origin}/openapi.json`, type: 'application/openapi+json' },
        { href: `${docs}/openapi.json`, type: 'application/openapi+json' },
      ],
      'service-doc': [
        { href: docs, type: 'text/html' },
        { href: `${docs}/getting-started`, type: 'text/html' },
      ],
      status: [{ href: `${docs}/api/health`, type: 'application/json' }],
      describedby: [{ href: `${origin}/auth.md`, type: 'text/markdown' }],
    },
  ],
})

const aiCatalog = {
  version: '0.1',
  name: 'ClawQL',
  description: 'Agent-facing resources for ClawQL (MCP, docs, OpenAPI, skills, payments discovery).',
  homepage: origin,
  resources: [
    {
      type: 'mcp-server-card',
      url: `${origin}/.well-known/mcp/server-card.json`,
      mediaType: 'application/json',
    },
    {
      type: 'mcp-server-json',
      url: `${origin}/.well-known/mcp/server.json`,
      mediaType: 'application/json',
    },
    {
      type: 'openapi',
      url: `${docs}/openapi.json`,
      mediaType: 'application/openapi+json',
    },
    {
      type: 'llms-txt',
      url: `${origin}/llms.txt`,
      mediaType: 'text/plain',
    },
    {
      type: 'docs',
      url: docs,
      mediaType: 'text/html',
    },
    {
      type: 'agent-skills',
      url: `${origin}/.well-known/agent-skills/index.json`,
      mediaType: 'application/json',
    },
    {
      type: 'auth-md',
      url: `${origin}/auth.md`,
      mediaType: 'text/markdown',
    },
    {
      type: 'pricing',
      url: `${origin}/pricing.md`,
      mediaType: 'text/markdown',
    },
  ],
}
writeJson(path.join(publicDir, '.well-known/ai-catalog.json'), aiCatalog)
writeJson(path.join(publicDir, '.well-known/ard.json'), {
  ...aiCatalog,
  $schema: 'https://agenticresourcediscovery.org/schemas/ard-catalog.json',
  catalog: aiCatalog.resources,
})

writeJson(path.join(publicDir, '.well-known/oauth-authorization-server'), {
  issuer: googleOidc.issuer,
  authorization_endpoint: googleOidc.authorization_endpoint,
  token_endpoint: googleOidc.token_endpoint,
  jwks_uri: googleOidc.jwks_uri,
  revocation_endpoint: googleOidc.revocation_endpoint,
  scopes_supported: googleOidc.scopes_supported,
  response_types_supported: googleOidc.response_types_supported,
  grant_types_supported: (googleOidc.grant_types_supported ?? []).filter(
    (g) => g !== 'urn:ietf:params:oauth:grant-type:device_code',
  ),
  token_endpoint_auth_methods_supported: googleOidc.token_endpoint_auth_methods_supported,
  code_challenge_methods_supported: googleOidc.code_challenge_methods_supported,
})

writeJson(path.join(publicDir, '.well-known/openid-configuration'), googleOidc)

writeJson(path.join(publicDir, '.well-known/oauth-protected-resource'), {
  resource: origin,
  authorization_servers: [googleOidc.issuer],
  scopes_supported: googleOidc.scopes_supported,
  bearer_methods_supported: ['header'],
  resource_name: 'ClawQL',
  resource_documentation: `${docs}/spec-configuration`,
})

writeJson(path.join(publicDir, '.well-known/payments.json'), {
  name: 'ClawQL',
  description:
    'Marketing-site payment discovery. Live Stripe/x402/MPP rails run on self-hosted ClawQL; see docs.clawql.com/.well-known/payments.json for protocol stubs.',
  pricing: `${origin}/pricing/`,
  signup: `${origin}/signup/`,
  documentation: `${docs}/payments/clawql-payments`,
  related: {
    docsPayments: `${docs}/.well-known/payments.json`,
    ucp: `${origin}/.well-known/ucp`,
    acp: `${origin}/.well-known/acp.json`,
  },
})

writeJson(path.join(publicDir, '.well-known/ucp'), {
  ucp: {
    version: '2026-04-08',
    spec: 'https://ucp.dev/2026-04-08/specification/overview',
    services: {
      'dev.ucp.shopping': [
        {
          version: '2026-04-08',
          spec: 'https://ucp.dev/2026-04-08/specification/overview',
          transport: 'rest',
          endpoint: origin,
          schema: 'https://ucp.dev/2026-04-08/services/shopping/rest.openapi.json',
        },
        ...(publicMcpUrl
          ? [
              {
                version: '2026-04-08',
                transport: 'mcp',
                endpoint: publicMcpUrl,
                schema: 'https://ucp.dev/2026-04-08/services/shopping/mcp.openrpc.json',
              },
            ]
          : []),
      ],
    },
  },
  note: 'Discovery stub for clawql.com; checkout adapters run on self-hosted ClawQL.',
})

writeJson(path.join(publicDir, '.well-known/acp.json'), {
  protocol: {
    name: 'acp',
    version: '2026-01-30',
    supported_versions: ['2026-01-30'],
    documentation_url: 'https://agenticcommerce.dev',
  },
  api_base_url: origin,
  transports: ['rest', 'mcp', 'a2a'],
  capabilities: {
    services: ['checkout', 'orders', 'delegate_payment'],
  },
  note: 'Discovery stub for clawql.com; live ACP adapters are self-hosted.',
})

// Thin OpenAPI pointer so marketing-host scanners find a schema (full commerce OpenAPI on docs).
writeJson(path.join(publicDir, 'openapi.json'), {
  openapi: '3.1.0',
  info: {
    title: 'ClawQL discovery',
    version: VERSION,
    description:
      'Marketing-site OpenAPI pointer. ClawQL turns *your* OpenAPI into MCP tools. Canonical docs OpenAPI (commerce/discovery): https://docs.clawql.com/openapi.json. Self-host MCP: npx clawql-mcp.',
    contact: { name: 'ClawQL', email: 'hello@clawql.com', url: `${origin}/contact/` },
    license: { name: 'Apache-2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0.html' },
  },
  servers: [{ url: origin, description: 'Marketing site' }],
  paths: {
    '/api/health': {
      get: {
        operationId: 'clawqlSiteHealth',
        summary: 'Marketing site health probe',
        description: 'Lightweight liveness for the clawql.com static site / edge.',
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['ok'],
                  properties: {
                    ok: { type: 'boolean' },
                    service: { type: 'string' },
                  },
                },
              },
            },
          },
          '404': {
            description: 'Not found (JSON)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Error: {
        type: 'object',
        required: ['error', 'message'],
        properties: {
          error: { type: 'string', description: 'Machine-readable error code' },
          message: { type: 'string', description: 'Human-readable message' },
          docs: { type: 'string', format: 'uri', description: 'Link to docs or llms.txt' },
        },
      },
    },
  },
  externalDocs: {
    description: 'ClawQL documentation OpenAPI',
    url: `${docs}/openapi.json`,
  },
})

writeJson(path.join(publicDir, 'api/health'), {
  ok: true,
  service: 'clawql-www',
  version: VERSION,
})

const linkHeader = getLinkHeaderValue()
writeText(
  path.join(publicDir, '_headers'),
  `/*
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  Link: ${linkHeader}

/index.md
  Content-Type: text/markdown; charset=utf-8

/pricing.md
  Content-Type: text/markdown; charset=utf-8

/contact.md
  Content-Type: text/markdown; charset=utf-8

/auth.md
  Content-Type: text/markdown; charset=utf-8

/llms.txt
  Content-Type: text/plain; charset=utf-8

/openapi.json
  Content-Type: application/openapi+json; charset=utf-8

/server.json
  Content-Type: application/json; charset=utf-8

/api/health
  Content-Type: application/json; charset=utf-8

/.well-known/api-catalog
  Content-Type: application/linkset+json

/.well-known/ai-catalog.json
  Content-Type: application/json; charset=utf-8

/.well-known/ard.json
  Content-Type: application/json; charset=utf-8

/.well-known/oauth-protected-resource
  Content-Type: application/json; charset=utf-8

/.well-known/oauth-authorization-server
  Content-Type: application/json; charset=utf-8

/.well-known/openid-configuration
  Content-Type: application/json; charset=utf-8

/.well-known/ucp
  Content-Type: application/json; charset=utf-8

/.well-known/payments.json
  Content-Type: application/json; charset=utf-8

/.well-known/acp.json
  Content-Type: application/json; charset=utf-8

/.well-known/mcp/server-card.json
  Content-Type: application/json; charset=utf-8

/.well-known/mcp/server.json
  Content-Type: application/json; charset=utf-8

/.well-known/agent-card.json
  Content-Type: application/json; charset=utf-8

/.well-known/agent-skills/index.json
  Content-Type: application/json; charset=utf-8
`,
)

writeText(
  path.join(publicDir, 'llms.txt'),
  `# ClawQL

> Agentic Gateway for Auditable Production AI — OpenAPI → MCP, CLI, Streams, vault memory. Self-host free (Apache 2.0).

## Install

- CLI: \`npx ${NPM_PKG}\` · npm https://www.npmjs.com/package/${NPM_PKG}
- HTTP MCP: \`npx -p ${NPM_PKG} clawql-mcp-http\`
- Installer: ${origin}/install

## Docs

- [Docs home](${docs})
- [Getting started](${docs}/getting-started)
- [MCP tools](${docs}/mcp/mcp-tools)
- [OpenAPI (docs)](${docs}/openapi.json)
- [llms-full](${docs}/llms-full.txt)
- [skill.md](${docs}/skill.md)

## Site

- [Pricing](${origin}/pricing/) · [pricing.md](${origin}/pricing.md)
- [Benchmarks](${origin}/benchmarks/)
- [Contact](${origin}/contact/)
- [Inference-first GTM playbook](${origin}/inference/gtm/)
- [Enterprise GTM playbook](${origin}/enterprise/gtm/)
- [index.md](${origin}/index.md)
- [auth.md](${origin}/auth.md)
- [MCP server card](${origin}/.well-known/mcp/server-card.json)
- [MCP server.json](${origin}/.well-known/mcp/server.json)
- [AI catalog](${origin}/.well-known/ai-catalog.json)
- [Agent skills](${origin}/.well-known/agent-skills/index.json)
- [OpenAPI pointer](${origin}/openapi.json)
- [Streams](${origin}/streams/)
- [Agents](${origin}/agents/)
- [Security](${origin}/security/)
`,
)

const installSrc = path.join(repoRoot, 'scripts/install.sh')
if (fs.existsSync(installSrc)) {
  const installBody = fs.readFileSync(installSrc, 'utf8')
  writeText(path.join(publicDir, 'install'), installBody)
  writeText(path.join(publicDir, 'install.sh'), installBody)
} else {
  console.warn(`[agent-assets] Missing ${installSrc}; skipped /install`)
}

writeText(
  path.join(publicDir, '_redirects'),
  [
    '# Apex is canonical; www should 301 here (Cloudflare Pages / Redirect Rules).',
    'https://www.clawql.com/* https://clawql.com/:splat 301',
    '/install.sh /install 301',
    '/protocol-fabric /streams 301',
    '/protocol-fabric/ /streams 301',
    '/demo /signup 301',
    '/demo/ /signup 301',
    '',
  ].join('\n'),
)

console.log(`[agent-assets] Wrote agent-readiness files for ${origin}`)
