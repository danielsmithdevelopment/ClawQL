/**
 * Curated hub routes for WebMCP `clawql.docs.list_routes`.
 * Prefer this over dumping the full sitemap — agents need a short discovery map.
 */
export type DocsHubRoute = {
  path: string
  title: string
  summary: string
}

export const DOCS_HUB_ROUTES: ReadonlyArray<DocsHubRoute> = [
  {
    path: '/',
    title: 'Home',
    summary: 'ClawQL docs landing and agent-first overview',
  },
  {
    path: '/quickstart',
    title: 'Quickstart',
    summary: 'Fastest path to a running MCP gateway',
  },
  {
    path: '/getting-started',
    title: 'Getting started',
    summary: 'Install options and first-run guides',
  },
  {
    path: '/getting-started/migrate-to-8.0',
    title: 'Migrate to 8.0',
    summary: 'Breaking changes and upgrade checklist for clawql-mcp 8.0',
  },
  {
    path: '/agent-setup',
    title: 'Agent setup',
    summary: 'Vault-first onboarding and Cursor / local agent sandbox',
  },
  {
    path: '/learn',
    title: 'Learn',
    summary: 'How-to modules for search, memory, streams, and optional tools',
  },
  {
    path: '/learn/search-and-execute-mcp',
    title: 'Search and execute',
    summary: 'Core MCP search → execute workflow',
  },
  {
    path: '/learn/memory',
    title: 'Memory',
    summary: 'Obsidian vault memory_ingest / memory_recall',
  },
  {
    path: '/memory/okf',
    title: 'OKF memory format',
    summary: 'Open Knowledge Format frontmatter for vault notes',
  },
  {
    path: '/plugins',
    title: 'Plugins',
    summary: 'Interactive registry of horizontal plugins and domain verticals',
  },
  {
    path: '/architecture',
    title: 'Architecture',
    summary: 'Gateway layout, ontology, and agentic fabric',
  },
  {
    path: '/deployment',
    title: 'Deployment',
    summary: 'Docker, Kubernetes, Helm, and operations',
  },
  {
    path: '/security',
    title: 'Security',
    summary: 'Defense in depth, status, and training curriculum',
  },
  {
    path: '/streams/clawql-streams',
    title: 'Streams',
    summary: 'ClawQL Streams, celld, and Durable Objects',
  },
  {
    path: '/mcp/mcp-api-adapter',
    title: 'MCP API adapter',
    summary: 'Protocol fabric REST / HTMX / MCP-UI adapter',
  },
  {
    path: '/tools',
    title: 'Tools reference',
    summary: 'MCP tool catalog overview',
  },
  {
    path: '/troubleshooting',
    title: 'Troubleshooting',
    summary: 'Common failures and fixes',
  },
  {
    path: '/archive',
    title: 'Archive',
    summary: 'Legacy and off-sidebar documentation',
  },
]
