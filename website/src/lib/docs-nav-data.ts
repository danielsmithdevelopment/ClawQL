/**
 * Single source of truth for docs sidebar navigation.
 * Hub card grids (`docs-hub-data.ts`) surface long-tail pages not listed here.
 * Off-sidebar routes are also indexed on `/archive` (generated catalog).
 */

import { trainingModules } from '@/generated/security-training/registry'
import { pluginsHubCards } from '@/lib/docs-hub-data'
import { learnModuleSiteCards } from '@/lib/docs-site-card-data'

export type NavLink = {
  title: string
  href: string
  /** Shown as a small tag in the sidebar when set */
  tag?: string
}

export type NavGroup = {
  title: string
  links: Array<NavLink>
}

/** Prefer the clause before `:` so long training titles fit the sidebar. */
function shortSecurityTitle(title: string): string {
  const beforeColon = title.split(':')[0]?.trim()
  return beforeColon && beforeColon.length > 0 ? beforeColon : title
}

const securityBestPracticeLinks: Array<NavLink> = trainingModules.map(
  (module) => ({
    title: shortSecurityTitle(module.title),
    href: `/security/best-practices/${module.slug}`,
    tag: String(module.part),
  }),
)

/** Stable sidebar order for `/learn/*` modules (titles from hub cards). */
const LEARN_MODULE_HREFS = [
  '/learn/search-and-execute-mcp',
  '/learn/memory',
  '/learn/external-ingest-knowledge',
  '/learn/knowledge-search-onyx',
  '/learn/document-pipeline',
  '/learn/sandbox-exec',
  '/learn/effect-ts',
  '/learn/ouroboros-tools',
  '/learn/schedule-notify-workflows',
  '/learn/cache-handoff-between-chats',
  '/learn/audit-tool-and-observability',
] as const

const learnModuleByHref = new Map(
  learnModuleSiteCards.map((card) => [card.href, card.name]),
)

const learnModuleLinks: Array<NavLink> = LEARN_MODULE_HREFS.map((href) => ({
  title:
    learnModuleByHref.get(href) ?? href.split('/').pop()!.replace(/-/g, ' '),
  href,
}))

const pluginDetailLinks: Array<NavLink> = pluginsHubCards.map((card) => ({
  title: card.name,
  href: card.href,
}))

/** First-run sidebar — Security lists every /security/* page. */
export const docsNavigation: Array<NavGroup> = [
  {
    title: 'Getting started',
    links: [
      { title: 'Overview', href: '/getting-started' },
      { title: 'Quickstart', href: '/quickstart' },
      { title: 'Agent setup', href: '/agent-setup' },
      { title: 'Inference setup', href: '/getting-started/inference' },
      {
        title: 'Custom sources',
        href: '/getting-started/custom-sources',
        tag: 'MCP',
      },
      { title: 'MCP clients', href: '/mcp-clients' },
      { title: 'For teams', href: '/getting-started/for-teams' },
      {
        title: 'Immutable releases',
        href: '/getting-started/immutable-releases',
      },
      {
        title: 'Migrate to 8.0',
        href: '/getting-started/migrate-to-8.0',
        tag: 'Breaking',
      },
    ],
  },
  {
    title: 'Security',
    links: [
      { title: 'Overview', href: '/security' },
      {
        title: 'Defense in depth',
        href: '/security/defense-in-depth',
      },
      {
        title: 'Best practices',
        href: '/security/best-practices',
      },
      ...securityBestPracticeLinks,
    ],
  },
  {
    title: 'Deploy',
    links: [
      { title: 'Deployment', href: '/deployment' },
      {
        title: 'Operations guide',
        href: '/deployment/operations-guide',
      },
      { title: 'Platforms', href: '/deployment/platforms' },
      { title: 'Kubernetes & Helm', href: '/deployment/kubernetes' },
      { title: 'Helm charts', href: '/helm' },
      { title: 'NATS JetStream', href: '/nats-jetstream' },
      { title: 'OpenClaw', href: '/openclaw' },
      { title: 'Tailscale', href: '/tailscale' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { title: 'Learn', href: '/learn' },
      { title: 'Concepts', href: '/concepts' },
      ...learnModuleLinks,
      {
        title: 'Token efficiency',
        href: '/architecture/token-efficiency',
      },
      { title: 'Troubleshooting', href: '/troubleshooting' },
    ],
  },
  {
    title: 'Plugins',
    links: [
      { title: 'Plugins', href: '/plugins' },
      { title: 'Domain verticals', href: '/plugins#verticals' },
      { title: 'Plugin model', href: '/plugins#plugin-model' },
      ...pluginDetailLinks,
    ],
  },
  {
    title: 'Platform',
    links: [
      { title: 'Vision & status', href: '/vision/roadmap' },
      { title: 'Architecture', href: '/architecture' },
      {
        title: 'Zero-Trust Agentic Fabric',
        href: '/architecture/agentic-fabric',
      },
      {
        title: 'Enterprise Ontology',
        href: '/architecture/enterprise-ontology',
      },
      { title: 'IDP platform', href: '/vision/idp-platform' },
      {
        title: 'Operator target architecture',
        href: '/design/operator-target-architecture',
      },
      {
        title: 'memory_recall structured filters',
        href: '/specs/memory/memory-recall-structured-filter',
        tag: 'v0.1',
      },
      {
        title: 'Legal domain ontology',
        href: '/specs/ontology/legal-domain',
        tag: 'v0.1',
      },
      {
        title: 'clawql-network',
        href: '/specs/network/clawql-network',
        tag: 'v0.1',
      },
      {
        title: 'clawql-agents',
        href: '/agents/clawql-agents',
        tag: 'v0.1',
      },
      { title: '.cq* extensions', href: '/specs/cq-extensions' },
      { title: 'clawql-inference', href: '/inference/clawql-inference' },
      { title: 'clawql-payments', href: '/payments/clawql-payments' },
      {
        title: 'Immutable releases vision',
        href: '/vision/immutable-releases',
      },
      {
        title: 'clawql-surveillance',
        href: '/surveillance/clawql-surveillance',
        tag: 'Spec',
      },
      {
        title: 'ClawQL Streams',
        href: '/streams/clawql-streams',
        tag: 'Draft',
      },
      {
        title: 'Durable Objects',
        href: '/streams/clawql-durable-objects',
        tag: 'Draft',
      },
      {
        title: 'celld integration',
        href: '/streams/clawql-celld',
        tag: 'Draft',
      },
      {
        title: 'clawql-cellrt',
        href: '/streams/clawql-cellrt',
        tag: 'Draft',
      },
      {
        title: 'clawql-tee',
        href: '/streams/clawql-tee',
        tag: 'Draft',
      },
      {
        title: 'TEE air-gap audit',
        href: '/streams/clawql-tee-airgap-audit',
        tag: 'Draft',
      },
      {
        title: 'QR stream transport',
        href: '/streams/clawql-qr-stream-transport',
        tag: 'Draft',
      },
      {
        title: 'clawql-government',
        href: '/government/clawql-government',
        tag: 'Draft',
      },
      { title: 'Ouroboros', href: '/ouroboros' },
      { title: 'DAOS architecture', href: '/ouroboros/daos' },
    ],
  },
  {
    title: 'Reference',
    links: [
      { title: 'Reference', href: '/reference' },
      { title: 'MCP tools', href: '/tools' },
      { title: 'Authentication', href: '/auth' },
      { title: 'Audit Trail', href: '/audit' },
      { title: 'Observability', href: '/observability' },
      { title: 'mcp-api-adapter', href: '/mcp/mcp-api-adapter' },
      { title: '/mcp-ui', href: '/mcp/mcp-ui' },
      { title: 'Protocol Fabric', href: '/mcp/protocol-fabric' },
      { title: 'Configuration', href: '/spec-configuration' },
      {
        title: 'Contributor spec',
        href: '/contributing/technical-specification',
      },
    ],
  },
  {
    title: 'More',
    links: [
      { title: 'Examples', href: '/examples' },
      { title: 'Benchmarks', href: '/benchmarks' },
      { title: 'Changelog', href: '/resources/changelog' },
      { title: 'Docs archive', href: '/archive' },
    ],
  },
]

/** Mobile drawer shortcuts (top of sidebar on small screens). */
export const docsMobileShortcuts: Array<{ title: string; href: string }> = [
  { title: 'Home', href: '/' },
  { title: 'Quickstart', href: '/quickstart' },
  { title: 'Security', href: '/security' },
  { title: 'Deploy', href: '/deployment' },
  { title: 'Learn', href: '/learn' },
  { title: 'Plugins', href: '/plugins' },
  { title: 'Reference', href: '/reference' },
  { title: 'GitHub', href: 'https://github.com/danielsmithdevelopment/ClawQL' },
]
