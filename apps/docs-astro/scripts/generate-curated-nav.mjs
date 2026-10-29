/**
 * Emit src/lib/nav.curated.json from apps/docs curated sources
 * (docs-nav-data + hub cards + security training registry).
 * Prefer this over auto-titling MDX H1s — avoids "Case study" / duplicate labels.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const astroRoot = path.join(__dirname, '..')
const docsRoot = path.join(astroRoot, '../docs')
const out = path.join(astroRoot, 'src/lib/nav.curated.json')
const generatedOut = path.join(astroRoot, 'src/lib/nav.generated.json')

function read(rel) {
  return fs.readFileSync(path.join(docsRoot, rel), 'utf8')
}

function cardsFromExport(src, exportName) {
  const m = src.match(new RegExp(`export const ${exportName}\\s*(?::[^=]+)?=\\s*\\[`))
  if (!m) return []
  const i = m.index + m[0].length - 1
  let depth = 0
  let start = null
  let body = ''
  for (let j = i; j < src.length; j++) {
    const ch = src[j]
    if (ch === '[') {
      if (depth === 0) start = j + 1
      depth++
    } else if (ch === ']') {
      depth--
      if (depth === 0) {
        body = src.slice(start, j)
        break
      }
    }
  }
  const outCards = []
  for (const chunk of body.split(/\n\s*(?:card\()?\{/)) {
    const href = chunk.match(/href:\s*'([^']+)'/)
    const name = chunk.match(/name:\s*'([^']+)'/)
    if (href && name) outCards.push({ href: href[1], name: name[1] })
  }
  return outCards
}

function learnCards(src) {
  const start = src.indexOf('export const learnModuleSiteCards')
  if (start < 0) return []
  let chunk = src.slice(start)
  const next = chunk.slice(1).search(/\nexport const /)
  if (next >= 0) chunk = chunk.slice(0, next + 1)
  const cards = []
  for (const m of chunk.matchAll(/\{\s*href:\s*'([^']+)'\s*,\s*name:\s*'([^']+)'/g)) {
    cards.push({ href: m[1], name: m[2] })
  }
  return cards
}

function trainingModules(src) {
  const mods = []
  for (const m of src.matchAll(/slug:\s*'([^']+)',\s*title:\s*((?:'[^{]+?'\s*)+),/g)) {
    const title = [...m[2].matchAll(/'([^']*)'/g)].map((x) => x[1]).join('')
    mods.push({ slug: m[1], title })
  }
  mods.forEach((mod, i) => {
    mod.part = i + 1
  })
  return mods
}

function shortSec(title) {
  const before = title.split(':')[0]?.trim()
  return before || title
}

const hub = read('src/lib/docs-hub-data.ts')
const learnSrc = read('src/lib/docs-site-card-data.ts')
const reg = read('src/generated/security-training/registry.tsx')

const examples = cardsFromExport(hub, 'exampleSiteCards')
const plugins = cardsFromExport(hub, 'pluginsHubCards')
const learn = learnCards(learnSrc)
const mods = trainingModules(reg)

if (examples.length < 5 || mods.length < 20) {
  console.error('Curated nav source parse failed', {
    examples: examples.length,
    plugins: plugins.length,
    learn: learn.length,
    mods: mods.length,
  })
  process.exit(1)
}

const LEARN_MODULE_HREFS = [
  '/learn/search-and-execute-mcp',
  '/learn/memory',
  '/learn/external-ingest-knowledge',
  '/learn/knowledge-search-onyx',
  '/learn/document-pipeline',
  '/learn/payments-and-entitlements',
  '/learn/sandbox-exec',
  '/learn/optional-mcp-tools',
  '/learn/effect-ts',
  '/learn/ouroboros-tools',
  '/learn/streams-getting-started',
  '/learn/nats-idp-pipeline',
  '/learn/schedule-notify-workflows',
  '/learn/cache-handoff-between-chats',
  '/learn/audit-tool-and-observability',
  '/learn/panguard-mcp-enforcement',
]

const learnBy = new Map(learn.map((c) => [c.href, c.name]))
const learnLinks = LEARN_MODULE_HREFS.map((href) => ({
  title: learnBy.get(href) ?? href.split('/').pop().replace(/-/g, ' '),
  href,
}))

const secLinks = mods.map((m) => ({
  title: shortSec(m.title),
  href: `/security/best-practices/${m.slug}`,
  tag: String(m.part),
}))

const pluginLinks = plugins.map((p) => ({ title: p.name, href: p.href }))
const exampleLinks = examples.map((e) => ({
  title: e.name.replace(/^Example:\s*/, ''),
  href: e.href,
}))

const nav = [
  {
    title: 'Getting started',
    links: [
      { title: 'Overview', href: '/getting-started' },
      { title: 'Quickstart', href: '/quickstart' },
      { title: 'Agent setup', href: '/agent-setup' },
      { title: 'Inference setup', href: '/getting-started/inference' },
      { title: 'Custom sources', href: '/getting-started/custom-sources', tag: 'MCP' },
      { title: 'MCP clients', href: '/mcp-clients' },
      { title: 'For teams', href: '/getting-started/for-teams' },
      { title: 'Immutable releases', href: '/getting-started/immutable-releases' },
      { title: 'Migrate to 8.0', href: '/getting-started/migrate-to-8.0', tag: 'Breaking' },
    ],
  },
  {
    title: 'Security',
    links: [
      { title: 'Overview', href: '/security' },
      { title: 'Security status', href: '/security/status', tag: 'Evidence' },
      { title: 'Defense in depth', href: '/security/defense-in-depth' },
      { title: 'Best practices', href: '/security/best-practices' },
      ...secLinks,
    ],
  },
  {
    title: 'Deploy',
    links: [
      { title: 'Deployment', href: '/deployment' },
      { title: 'Operations guide', href: '/deployment/operations-guide' },
      { title: 'Platforms', href: '/deployment/platforms' },
      { title: 'Kubernetes & Helm', href: '/deployment/kubernetes' },
      { title: 'Helm charts', href: '/helm' },
      { title: 'NATS JetStream', href: '/nats-jetstream' },
      { title: 'Docker Desktop observability', href: '/docker-desktop-observability' },
      { title: 'Dashboard on Kubernetes', href: '/dashboard-kubernetes' },
      { title: 'OpenClaw', href: '/openclaw' },
      { title: 'Tailscale', href: '/tailscale' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { title: 'Overview', href: '/learn' },
      { title: 'Concepts', href: '/concepts' },
      ...learnLinks,
      { title: 'Token efficiency', href: '/architecture/token-efficiency' },
      { title: 'Troubleshooting', href: '/troubleshooting' },
    ],
  },
  {
    title: 'Plugins',
    links: [
      { title: 'Overview', href: '/plugins' },
      { title: 'Domain verticals', href: '/plugins#verticals' },
      { title: 'Plugin model', href: '/plugins#plugin-model' },
      ...pluginLinks,
    ],
  },
  {
    title: 'Platform',
    links: [
      { title: 'Vision & status', href: '/vision/roadmap' },
      { title: 'Architecture', href: '/architecture' },
      { title: 'Zero-Trust Agentic Fabric', href: '/architecture/agentic-fabric' },
      { title: 'Enterprise Ontology', href: '/architecture/enterprise-ontology' },
      { title: 'IDP platform', href: '/vision/idp-platform' },
      { title: 'Operator target architecture', href: '/design/operator-target-architecture' },
      { title: 'memory_recall structured filters', href: '/specs/memory/memory-recall-structured-filter', tag: 'v0.1' },
      { title: 'Legal domain ontology', href: '/specs/ontology/legal-domain', tag: 'v0.1' },
      { title: 'Fast Decision routing closeout', href: '/specs/classifier/fast-decision-routing-closeout', tag: 'v0.4' },
      { title: 'clawql-network', href: '/specs/network/clawql-network', tag: 'v0.1' },
      { title: 'clawql-agents', href: '/agents/clawql-agents', tag: 'v0.1' },
      { title: '.cq* extensions', href: '/specs/cq-extensions' },
      { title: '.cqe contracts', href: '/specs/cq-extensions/cqe', tag: 'Ext' },
      { title: '.cqm memory', href: '/specs/cq-extensions/cqm', tag: 'Ext' },
      { title: '.cqk knowledge', href: '/specs/cq-extensions/cqk', tag: 'Ext' },
      { title: '.cqw workflows', href: '/specs/cq-extensions/cqw', tag: 'Ext' },
      { title: 'Bundled specs', href: '/bundled-specs' },
      { title: 'GraphQL layer', href: '/graphql-proxy' },
      { title: 'HITL — Label Studio', href: '/hitl-label-studio' },
      { title: 'Flink Onyx sync', href: '/flink-onyx-sync' },
      { title: 'Onyx knowledge (legacy)', href: '/onyx-knowledge', tag: 'Legacy' },
      { title: 'clawql-inference', href: '/inference/clawql-inference' },
      { title: 'clawql-payments', href: '/payments/clawql-payments' },
      { title: 'Immutable releases vision', href: '/vision/immutable-releases' },
      { title: 'clawql-surveillance', href: '/surveillance/clawql-surveillance', tag: 'Spec' },
      { title: 'ClawQL Streams', href: '/streams/clawql-streams', tag: 'Draft' },
      { title: 'Durable Objects', href: '/streams/clawql-durable-objects', tag: 'Draft' },
      { title: 'celld integration', href: '/streams/clawql-celld', tag: 'Draft' },
      { title: 'Streams + celld evidence', href: '/streams/streams-celld-evidence', tag: 'Evidence' },
      { title: 'Bursty Streams on AWS', href: '/streams/aws-celld-burst', tag: 'Draft' },
      { title: 'clawql-cellrt', href: '/streams/clawql-cellrt', tag: 'Draft' },
      { title: 'clawql-tee', href: '/streams/clawql-tee', tag: 'Draft' },
      { title: 'TEE air-gap audit', href: '/streams/clawql-tee-airgap-audit', tag: 'Draft' },
      { title: 'QR stream transport', href: '/streams/clawql-qr-stream-transport', tag: 'Draft' },
      { title: 'clawql-government', href: '/government/clawql-government', tag: 'Draft' },
      { title: 'Ouroboros', href: '/ouroboros' },
      { title: 'DAOS architecture', href: '/ouroboros/daos' },
      { title: 'DAOS specification', href: '/ouroboros/specification' },
      { title: 'DAOS build plan', href: '/ouroboros/build-plan' },
    ],
  },
  {
    title: 'Reference',
    links: [
      { title: 'Overview', href: '/reference' },
      { title: 'MCP tools', href: '/tools' },
      { title: 'Protocol', href: '/reference/protocol' },
      { title: 'Optional tools', href: '/reference/optional-tools' },
      { title: 'HITL reference', href: '/reference/hitl' },
      { title: 'Plugin contracts', href: '/reference/plugins' },
      { title: 'Verticals reference', href: '/reference/verticals' },
      { title: 'Authentication', href: '/auth' },
      { title: 'Audit Trail', href: '/audit' },
      { title: 'Observability', href: '/observability' },
      { title: 'mcp-api-adapter', href: '/mcp/mcp-api-adapter' },
      { title: '/mcp-ui', href: '/mcp/mcp-ui' },
      { title: 'Protocol Fabric', href: '/mcp/protocol-fabric' },
      { title: 'Configuration', href: '/spec-configuration' },
      { title: 'Contributor spec', href: '/contributing/technical-specification' },
    ],
  },
  {
    title: 'More',
    links: [
      { title: 'Resources', href: '/resources' },
      { title: 'Examples', href: '/examples' },
      ...exampleLinks,
      { title: 'Benchmarks', href: '/benchmarks' },
      { title: 'Executor comparison', href: '/benchmarks/executor-comparison' },
      { title: 'Dominance roadmap (marketing)', href: 'https://clawql.com/benchmarks/#dominance' },
      { title: 'Slide deck', href: '/vision/slide-deck' },
      { title: 'Changelog', href: '/resources/changelog' },
      { title: 'Legacy URLs', href: '/archive' },
    ],
  },
]

// Compact long lists (match prior Astro sidebar budget)
const sec = nav.find((g) => g.title === 'Security')
const secMods = sec.links.filter(
  (l) => l.href.includes('/best-practices/') && l.href !== '/security/best-practices',
)
const secTop = sec.links.filter((l) => !secMods.includes(l))
sec.links = [
  ...secTop,
  ...secMods.slice(0, 8),
  ...(secMods.length > 8
    ? [{ title: `All ${secMods.length} modules…`, href: '/security/best-practices' }]
    : []),
]

const pl = nav.find((g) => g.title === 'Plugins')
const detail = pl.links.filter((l) => !(l.href === '/plugins' || l.href.startsWith('/plugins#')))
const head = pl.links.filter((l) => !detail.includes(l))
pl.links = [
  ...head,
  ...detail.slice(0, 12),
  ...(detail.length > 12 ? [{ title: `All ${detail.length} plugins…`, href: '/plugins' }] : []),
]

const payload = {
  docsNavigation: nav,
  docsMobileShortcuts: [
    { title: 'Home', href: '/' },
    { title: 'Quickstart', href: '/quickstart' },
    { title: 'Security', href: '/security' },
    { title: 'Security status', href: '/security/status' },
    { title: 'Deploy', href: '/deployment' },
    { title: 'Learn', href: '/learn' },
    { title: 'Plugins', href: '/plugins' },
    { title: 'Reference', href: '/reference' },
    { title: 'GitHub', href: 'https://github.com/danielsmithdevelopment/ClawQL' },
  ],
}

fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n')
fs.writeFileSync(generatedOut, JSON.stringify(nav, null, 2) + '\n')
console.log(
  `Wrote curated nav (${nav.length} groups, ${nav.reduce((n, g) => n + g.links.length, 0)} links) → ${path.relative(astroRoot, out)}`,
)
