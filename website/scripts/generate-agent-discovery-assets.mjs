#!/usr/bin/env node
/**
 * Prebuild: auth.md and A2A agent card for docs.clawql.com agent-readiness.
 *
 * Run from website/: node scripts/generate-agent-discovery-assets.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '../public')
const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://docs.clawql.com').replace(
  /\/$/,
  '',
)

function writeText(filePath, body) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, body.endsWith('\n') ? body : `${body}\n`)
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`)
}

writeText(
  path.join(publicDir, 'auth.md'),
  `# auth.md

Agent authentication and registration discovery for **${origin}** (ClawQL documentation and MCP reference).

## Audience

Software agents using ClawQL MCP tools (\`search\`, \`execute\`, \`memory_*\`, optional IDP and enterprise modules).

## OAuth Protected Resource

- \`${origin}/.well-known/oauth-protected-resource\`
- Resource: \`${origin}\`
- Authorization server: \`https://accounts.google.com\`

## Authorization server metadata

- \`${origin}/.well-known/oauth-authorization-server\`
- \`${origin}/.well-known/openid-configuration\`

## Agent registration

Self-hosted: [Getting started](${origin}/readme/getting-started). Configure MCP in your client with Streamable HTTP at \`${origin}/mcp\` when deployed.

\`\`\`json
{
  "agent_auth": {
    "skill": "clawql-mcp-client",
    "register_uri": "https://clawql.com/signup/",
    "methods": [
      {
        "type": "human_provisioning",
        "description": "Operator installs clawql-mcp and configures MCP client credentials."
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
`,
)

writeJson(path.join(publicDir, '.well-known/agent-card.json'), {
  name: 'ClawQL Documentation MCP',
  description:
    'Documentation site and MCP reference for ClawQL — search, execute, vault memory, and optional enterprise tooling.',
  version: '6.0.0',
  url: `${origin}/mcp`,
  provider: {
    organization: 'ClawQL',
    url: 'https://clawql.com',
  },
  capabilities: {
    streaming: true,
    pushNotifications: false,
  },
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['text/plain', 'application/json'],
  skills: [
    {
      id: 'docs-navigate',
      name: 'ClawQL documentation',
      description: 'Read installation, MCP tools, security, and deployment guides.',
      tags: ['documentation', 'mcp'],
      examples: ['Find execute tool parameters', 'Read Kubernetes deployment guide'],
    },
    {
      id: 'mcp-tools',
      name: 'MCP tool reference',
      description: 'Discover ClawQL MCP tool tiers and configuration.',
      tags: ['mcp', 'tools'],
      examples: ['List memory_ingest options'],
    },
  ],
  documentationUrl: origin,
  securitySchemes: {
    bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
  },
  security: [{ bearer: [] }],
})

console.log(`[agent-discovery-assets] Wrote auth.md and agent-card.json for ${origin}`)
