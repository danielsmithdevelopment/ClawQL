/**
 * Single source of truth for docs sidebar navigation.
 * Hub cards (`docs-hub-data.ts`) complement the sidebar for curated discovery.
 * `/archive` lists legacy redirect URLs only (generated catalog).
 */

import { trainingModules } from '@/generated/security-training/registry'
import { exampleSiteCards, pluginsHubCards } from '@/lib/docs-hub-data'
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

/** Examples hub case studies — sidebar under More (titles shortened). */
export const EXAMPLE_STUDY_HREFS = exampleSiteCards.map((card) => card.href)

const exampleStudyLinks: Array<NavLink> = exampleSiteCards.map((card) => ({
  title: card.name.replace(/^Example:\s*/, ''),
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
      { title: 'Security status', href: '/security/status', tag: 'Evidence' },
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
      {
        title: 'Docker Desktop observability',
        href: '/docker-desktop-observability',
      },
      {
        title: 'Dashboard on Kubernetes',
        href: '/dashboard-kubernetes',
      },
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
      { title: '.cqe contracts', href: '/specs/cq-extensions/cqe', tag: 'Ext' },
      { title: '.cqm memory', href: '/specs/cq-extensions/cqm', tag: 'Ext' },
      { title: '.cqk knowledge', href: '/specs/cq-extensions/cqk', tag: 'Ext' },
      { title: '.cqw workflows', href: '/specs/cq-extensions/cqw', tag: 'Ext' },
      { title: 'Bundled specs', href: '/bundled-specs' },
      { title: 'GraphQL layer', href: '/graphql-proxy' },
      { title: 'HITL — Label Studio', href: '/hitl-label-studio' },
      { title: 'Flink Onyx sync', href: '/flink-onyx-sync' },
      {
        title: 'Onyx knowledge (legacy)',
        href: '/onyx-knowledge',
        tag: 'Legacy',
      },
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
      { title: 'DAOS specification', href: '/ouroboros/specification' },
      { title: 'DAOS build plan', href: '/ouroboros/build-plan' },
    ],
  },
  {
    title: 'Reference',
    links: [
      { title: 'Reference', href: '/reference' },
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
      {
        title: 'Contributor spec',
        href: '/contributing/technical-specification',
      },
    ],
  },
  {
    title: 'More',
    links: [
      { title: 'Resources', href: '/resources' },
      { title: 'Examples', href: '/examples' },
      ...exampleStudyLinks,
      { title: 'Benchmarks', href: '/benchmarks' },
      {
        title: 'Executor comparison',
        href: '/benchmarks/executor-comparison',
      },
      { title: 'Slide deck', href: '/vision/slide-deck' },
      { title: 'Changelog', href: '/resources/changelog' },
      { title: 'Legacy URLs', href: '/archive' },
    ],
  },
]

/** Mobile drawer shortcuts (top of sidebar on small screens). */
export const docsMobileShortcuts: Array<{ title: string; href: string }> = [
  { title: 'Home', href: '/' },
  { title: 'Quickstart', href: '/quickstart' },
  { title: 'Security', href: '/security' },
  { title: 'Security status', href: '/security/status' },
  { title: 'Deploy', href: '/deployment' },
  { title: 'Learn', href: '/learn' },
  { title: 'Plugins', href: '/plugins' },
  { title: 'Reference', href: '/reference' },
  { title: 'GitHub', href: 'https://github.com/danielsmithdevelopment/ClawQL' },
]
