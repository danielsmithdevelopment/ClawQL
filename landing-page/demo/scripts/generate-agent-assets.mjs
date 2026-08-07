#!/usr/bin/env node
/**
 * Prebuild: agent-readiness static assets for clawql.com.
 *
 * Run from landing-page/demo/: node scripts/generate-agent-assets.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '../public')
const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://clawql.com').replace(/\/$/, '')
const docs = 'https://docs.clawql.com'

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

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`)
}

function writeText(filePath, body) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, body.endsWith('\n') ? body : `${body}\n`)
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
    `</auth.md>; rel="alternate"; type="text/markdown"`,
    `</.well-known/api-catalog>; rel="api-catalog"`,
    `</.well-known/mcp/server-card.json>; rel="service-desc"`,
    `</.well-known/agent-card.json>; rel="agent-card"; type="application/json"`,
    `</.well-known/payments.json>; rel="payment-method"`,
    `<${docs}>; rel="service-doc"`,
    `</auth.md>; rel="describedby"`,
    `<${docs}/api/health>; rel="status"`,
  ].join(', ')
}

function buildAuthMd() {
  return `# auth.md

Agent authentication and registration discovery for **${origin}**.

ClawQL is an MCP platform. Production MCP Streamable HTTP is hosted at **${docs}/mcp**.

## Audience

Software agents connecting to ClawQL MCP tools.

## OAuth Protected Resource

- Protected resource metadata: \`${origin}/.well-known/oauth-protected-resource\`
- Resource identifier: \`${origin}\`
- Authorization server: \`https://accounts.google.com\`
- Bearer methods: \`header\`

## Authorization server metadata

- \`${origin}/.well-known/oauth-authorization-server\`
- \`${origin}/.well-known/openid-configuration\`

## Agent registration

Hosted accounts: [${origin}/signup/](${origin}/signup/). Self-hosted: \`npm install -g clawql-mcp\` — see [${docs}/getting-started](${docs}/getting-started).

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

function getAgentMarkdownMap() {
  const description =
    'ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI — Regional Hubs, Dedicated Virtual Gateways, and Edge swarm. Self-host free or start a trial.'

  return {
    '/': `# ClawQL — Agentic Gateway for Auditable Production AI

${description}

## Install

\`\`\`bash
npm install -g clawql-mcp
\`\`\`

## Links

- Documentation: ${docs}
- Sign up: ${origin}/signup/
- Pricing: ${origin}/pricing/
`,
    '/pricing': `# Pricing\n\nSee ${origin}/pricing/ for ClawQL tiers.`,
    '/about': `# About\n\nSee ${origin}/about/.`,
    '/inference/gtm': `# Inference-first GTM playbook\n\nClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI — Zero-Trust Agentic Fabric (Regional Hubs, Dedicated Virtual Gateways with NATS/Valkey, Edge swarm).\n\nSee ${origin}/inference/gtm/.`,
    '/enterprise/gtm': `# Enterprise GTM playbook\n\nSecondary enterprise / Palantir-facing motion — Auditable Production AI on the Zero-Trust Agentic Fabric; sovereign alternative to Palantir AIP.\n\nSee ${origin}/enterprise/gtm/.`,
    '/streams': `# ClawQL Streams\n\nEvent-driven autonomous agents with WORM audit, Protocol Fabric, and Durable Object / K8s scale.\n\nSee ${origin}/streams/.\n\nSpecs: ${docs}/streams/clawql-streams · ${docs}/streams/clawql-durable-objects`,
    '/idp': `# Intelligent Document Processing\n\nSee ${origin}/idp/.`,
    '/signup': `# Sign up\n\n${origin}/signup/`,
    '/privacy-policy': `# Privacy Policy\n\n${origin}/privacy-policy/`,
    '/industries': `# Industries\n\n${origin}/industries/`,
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

writeText(path.join(publicDir, 'robots.txt'), buildRobotsTxt())
writeText(path.join(publicDir, 'auth.md'), buildAuthMd())
writeJson(path.join(publicDir, 'agent-markdown.json'), getAgentMarkdownMap())

writeJson(path.join(publicDir, '.well-known/mcp/server-card.json'), {
  $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
  name: 'io.github.danielsmithdevelopment/clawql-mcp',
  version: '6.0.0',
  description: 'MCP server: search + execute any OpenAPI 3 API with an internal GraphQL optimization layer',
  title: 'ClawQL',
  websiteUrl: origin,
  repository: { type: 'git', url: 'https://github.com/danielsmithdevelopment/ClawQL.git' },
  serverInfo: { name: 'clawql-mcp', version: '6.0.0' },
  capabilities: { tools: { listChanged: true }, resources: {}, prompts: {} },
  remotes: [
    {
      type: 'streamable-http',
      url: `${docs}/mcp`,
      supportedProtocolVersions: ['2025-03-12', '2025-06-18', '2025-11-25', '2026-07-28'],
    },
  ],
})

writeJson(path.join(publicDir, '.well-known/agent-card.json'), {
  name: 'ClawQL',
  description:
    'Agentic Gateway for Auditable Production AI — MCP search, execute, vault memory, optional IDP, and agentic commerce discovery (Stripe + x402 + MPP + AP2 + ACP).',
  version: '6.0.0',
  url: `${docs}/mcp`,
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

writeJson(path.join(publicDir, '.well-known/agent-skills/index.json'), {
  $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
  skills: [
    {
      name: 'clawql-search-workflows',
      type: 'skill-md',
      description: 'Use ClawQL search to discover correct operationIds before execute calls.',
      url: `${docs}/.well-known/agent-skills/clawql-search-workflows/SKILL.md`,
    },
    {
      name: 'clawql-vault-memory',
      type: 'skill-md',
      description: 'Persist durable outcomes with memory_ingest and recall with memory_recall.',
      url: `${docs}/.well-known/agent-skills/clawql-vault-memory/SKILL.md`,
    },
  ],
})

writeJson(path.join(publicDir, '.well-known/api-catalog'), {
  linkset: [
    {
      anchor: `${origin}/`,
      'service-desc': [{ href: `${docs}/.well-known/mcp/server-card.json`, type: 'application/json' }],
      'service-doc': [{ href: docs, type: 'text/html' }],
      status: [{ href: `${docs}/api/health`, type: 'application/json' }],
      describedby: [{ href: `${origin}/auth.md`, type: 'text/markdown' }],
    },
  ],
})

writeJson(path.join(publicDir, '.well-known/oauth-authorization-server'), {
  issuer: googleOidc.issuer,
  authorization_endpoint: googleOidc.authorization_endpoint,
  token_endpoint: googleOidc.token_endpoint,
  jwks_uri: googleOidc.jwks_uri,
  revocation_endpoint: googleOidc.revocation_endpoint,
  device_authorization_endpoint: googleOidc.device_authorization_endpoint,
  scopes_supported: googleOidc.scopes_supported,
  response_types_supported: googleOidc.response_types_supported,
  grant_types_supported: googleOidc.grant_types_supported,
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

// Commerce discovery stubs (pricing lives on clawql.com; settlement is self-hosted / docs).
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
        {
          version: '2026-04-08',
          transport: 'mcp',
          endpoint: `${docs}/mcp`,
          schema: 'https://ucp.dev/2026-04-08/services/shopping/mcp.openrpc.json',
        },
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

const linkHeader = getLinkHeaderValue()
writeText(
  path.join(publicDir, '_headers'),
  `/*
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  Link: ${linkHeader}

/.well-known/api-catalog
  Content-Type: application/linkset+json

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

/.well-known/agent-card.json
  Content-Type: application/json; charset=utf-8

/.well-known/agent-skills/index.json
  Content-Type: application/json; charset=utf-8
`,
)

writeText(
  path.join(publicDir, 'llms.txt'),
  `# ClawQL

> Agentic Gateway for Auditable Production AI — Regional Hubs, Dedicated Virtual Gateways, Edge swarm.

- [Docs](${docs})
- [Getting started](${docs}/getting-started)
- [ClawQL Streams](${origin}/streams/)
- [Inference-first GTM playbook](${origin}/inference/gtm/)
- [Enterprise GTM playbook](${origin}/enterprise/gtm/)
- [MCP Server Card](/.well-known/mcp/server-card.json)
`,
)

// One-line installer: curl -fsSL https://clawql.com/install | bash
const repoRoot = path.resolve(__dirname, '../../..')
const installSrc = path.join(repoRoot, 'scripts/install.sh')
if (fs.existsSync(installSrc)) {
  const installBody = fs.readFileSync(installSrc, 'utf8')
  writeText(path.join(publicDir, 'install'), installBody)
  writeText(path.join(publicDir, 'install.sh'), installBody)
} else {
  console.warn(`[agent-assets] Missing ${installSrc}; skipped /install`)
}

// Cloudflare Pages redirects (also documents intended apex policy for www).
writeText(
  path.join(publicDir, '_redirects'),
  [
    '# Apex is canonical; www should 301 here (Cloudflare Pages / Redirect Rules).',
    'https://www.clawql.com/* https://clawql.com/:splat 301',
    '/install.sh /install 301',
    '',
  ].join('\n'),
)

console.log(`[agent-assets] Wrote agent-readiness files for ${origin}`)
