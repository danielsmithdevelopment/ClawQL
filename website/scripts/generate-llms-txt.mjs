/**
 * Build step: llms.txt for AI agent discoverability (llmstxt.org convention).
 *
 * Run from website/: node scripts/generate-llms-txt.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.join(__dirname, '..')
const outFile = path.join(websiteRoot, 'public/llms.txt')
const agentsSrc = path.join(websiteRoot, '..', 'AGENTS.md')
const agentsOut = path.join(websiteRoot, 'public/AGENTS.md')

const ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://docs.clawql.com'
).replace(/\/$/, '')

const SECTIONS = [
  {
    heading: 'Getting started',
    links: [
      ['Agent setup', '/agent-setup', 'Desktop onboarding, Cursor iOS Cloud Agents, local sandbox'],
      ['Quickstart', '/quickstart', 'Fastest path to a running gateway'],
      ['Getting started', '/getting-started', 'Quickstart paths, teams, and install options'],
      ['Quickstart', '/quickstart', 'npx, install options, and first MCP connect'],
    ],
  },
  {
    heading: 'Core reference',
    links: [
      ['MCP tools', '/tools', 'search, execute, audit, cache, and optional tools'],
      [
        'Zero-Trust Agentic Fabric',
        '/architecture/agentic-fabric',
        'Regional Hubs, Dedicated Virtual Gateways, Edge swarm',
      ],
      [
        'Agentic Gateway (inference)',
        '/inference/clawql-inference',
        'OpenAI drop-in, flywheel, WORM path to Auditable Production AI',
      ],
      ['Plugins', '/plugins', 'Agentic Gateway core and optional plugin packages'],
      ['Protocol', '/reference/protocol', 'Uniform envelope and approval flows'],
      ['Spec configuration', '/spec-configuration', 'OpenAPI and provider sources'],
    ],
  },
  {
    heading: 'Deployment & security',
    links: [
      ['Deployment', '/deployment', 'Docker, Kubernetes, and operations'],
      ['Defense in depth', '/security/defense-in-depth', 'Layered MCP security model'],
      [
        'Security best practices',
        '/security/best-practices',
        '32-module agentic AI security series',
      ],
    ],
  },
  {
    heading: 'Agent discovery',
    links: [
      ['AGENTS.md', '/AGENTS.md', 'MCP proxy and blocked-tool behavior'],
      ['Agent skills', '/.well-known/agent-skills/index.json', 'RFC agent skills index'],
      ['API catalog', '/.well-known/api-catalog', 'RFC 9727 linkset'],
      ['MCP server card', '/.well-known/mcp/server-card.json', 'MCP server metadata'],
    ],
  },
]

function formatSection({ heading, links }) {
  let block = `## ${heading}\n`
  for (const [title, href, desc] of links) {
    const url = href.startsWith('http') ? href : `${ORIGIN}${href}`
    block += `- [${title}](${url}): ${desc}\n`
  }
  return block
}

function main() {
  let content = `# ClawQL documentation\n\n`
  content += `> ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI — OpenAPI/MCP search and execute, optional vault memory, Zero-Trust Agentic Fabric (Regional Hubs, Dedicated Virtual Gateways, Edge swarm), and defense-in-depth controls.\n\n`
  content += `This file helps AI agents and crawlers find canonical documentation. For full-text Markdown of any page, send \`Accept: text/markdown\` on that URL.\n\n`

  for (const section of SECTIONS) {
    content += formatSection(section)
    content += '\n'
  }

  content += `## Optional\n\n`
  content += `- [GitHub repository](https://github.com/danielsmithdevelopment/ClawQL): source code and issues\n`
  content += `- [Sitemap](${ORIGIN}/sitemap.xml): all indexed documentation URLs\n`

  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, content, 'utf8')
  console.log(`Wrote ${path.relative(process.cwd(), outFile)}`)

  if (fs.existsSync(agentsSrc)) {
    fs.copyFileSync(agentsSrc, agentsOut)
    console.log(`Copied AGENTS.md → ${path.relative(process.cwd(), agentsOut)}`)
  } else {
    console.warn('AGENTS.md not found at repo root; skipping copy')
  }
}

main()
