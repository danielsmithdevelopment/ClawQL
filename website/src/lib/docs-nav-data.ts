/**
 * Single source of truth for docs sidebar navigation.
 * Hub card grids (`docs-hub-data.ts`) surface long-tail pages not listed here.
 * Off-sidebar routes are also indexed on `/archive` (generated catalog).
 */

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

/** First-run sidebar — hubs only; long-tail lives on hub pages. */
export const docsNavigation: Array<NavGroup> = [
  {
    title: 'Getting started',
    links: [
      { title: 'Overview', href: '/getting-started' },
      { title: 'Quickstart', href: '/quickstart' },
      { title: 'Agent setup', href: '/agent-setup' },
      { title: 'Inference setup', href: '/getting-started/inference' },
      { title: 'MCP clients', href: '/mcp-clients' },
      { title: 'For teams', href: '/getting-started/for-teams' },
      {
        title: 'Immutable releases',
        href: '/getting-started/immutable-releases',
      },
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
    ],
  },
  {
    title: 'Learn',
    links: [
      { title: 'Learn', href: '/learn' },
      { title: 'Concepts', href: '/concepts' },
      { title: 'Memory', href: '/learn/memory' },
      {
        title: 'Token efficiency',
        href: '/architecture/token-efficiency',
      },
      { title: 'Security', href: '/security' },
      {
        title: 'Defense in depth',
        href: '/security/defense-in-depth',
      },
      {
        title: 'Security best practices',
        href: '/security/best-practices',
      },
      { title: 'Troubleshooting', href: '/troubleshooting' },
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
      { title: '.cq* extensions', href: '/specs/cq-extensions' },
      { title: 'clawql-inference', href: '/inference/clawql-inference' },
      { title: 'clawql-payments', href: '/payments/clawql-payments' },
      {
        title: 'Immutable releases vision',
        href: '/vision/immutable-releases',
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
      { title: 'Protocol', href: '/reference/protocol' },
      { title: 'Configuration', href: '/spec-configuration' },
      { title: 'Plugins', href: '/plugins' },
      {
        title: 'Panguard MCP proxy',
        href: '/plugins/panguard-proxy',
      },
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
      { title: 'Changelog', href: '/resources/changelog' },
      { title: 'Docs archive', href: '/archive' },
    ],
  },
]

/** Mobile drawer shortcuts (top of sidebar on small screens). */
export const docsMobileShortcuts: Array<{ title: string; href: string }> = [
  { title: 'Home', href: '/' },
  { title: 'Quickstart', href: '/quickstart' },
  { title: 'Deploy', href: '/deployment' },
  { title: 'Learn', href: '/learn' },
  { title: 'Reference', href: '/reference' },
  { title: 'GitHub', href: 'https://github.com/danielsmithdevelopment/ClawQL' },
]
