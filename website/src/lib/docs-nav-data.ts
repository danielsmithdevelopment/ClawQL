/**
 * Single source of truth for docs sidebar navigation.
 * Hub card grids (`docs-hub-data.ts`) surface long-tail pages not listed here.
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
      { title: 'Kubernetes & Helm', href: '/deployment/kubernetes' },
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
      { title: 'Troubleshooting', href: '/troubleshooting' },
    ],
  },
  {
    title: 'Plugins',
    links: [
      { title: 'Plugins', href: '/plugins' },
      { title: 'Domain verticals', href: '/plugins#verticals' },
      { title: 'Plugin model', href: '/plugins#plugin-model' },
      { title: 'Gateway core', href: '/plugins/core' },
      { title: 'Memory', href: '/plugins/memory' },
      { title: 'Documents', href: '/plugins/documents' },
      { title: 'Automation', href: '/plugins/automation' },
      { title: 'Sandbox', href: '/plugins/sandbox' },
      { title: 'Third-party', href: '/plugins/third-party' },
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
      {
        title: 'memory_recall structured filters',
        href: '/specs/memory/memory-recall-structured-filter',
        tag: 'Draft',
      },
      {
        title: 'Legal domain ontology',
        href: '/specs/ontology/legal-domain',
        tag: 'Draft',
      },
      { title: '.cq* extensions', href: '/specs/cq-extensions' },
      { title: 'clawql-inference', href: '/inference/clawql-inference' },
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
    ],
  },
  {
    title: 'Reference',
    links: [
      { title: 'Reference', href: '/reference' },
      { title: 'MCP tools', href: '/tools' },
      { title: 'Authentication', href: '/auth' },
      { title: 'mcp-api-adapter', href: '/mcp/mcp-api-adapter' },
      {
        title: '/mcp-ui',
        href: '/mcp/mcp-ui',
        tag: 'Shipped',
      },
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
      { title: 'Changelog', href: '/resources/changelog' },
    ],
  },
]

/** Mobile drawer shortcuts (top of sidebar on small screens). */
export const docsMobileShortcuts: Array<{ title: string; href: string }> = [
  { title: 'Home', href: '/' },
  { title: 'Quickstart', href: '/quickstart' },
  { title: 'Deploy', href: '/deployment' },
  { title: 'Learn', href: '/learn' },
  { title: 'Plugins', href: '/plugins' },
  { title: 'Reference', href: '/reference' },
  { title: 'GitHub', href: 'https://github.com/danielsmithdevelopment/ClawQL' },
]
