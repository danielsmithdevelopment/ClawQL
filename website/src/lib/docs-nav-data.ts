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

/** Condensed sidebar — one link per concept; ~35 entries (was 74). */
export const docsNavigation: Array<NavGroup> = [
  {
    title: 'Getting started',
    links: [
      { title: 'Overview', href: '/getting-started' },
      { title: 'Quickstart', href: '/quickstart' },
      {
        title: 'Phase 1 guide (7.0)',
        href: '/getting-started/phase-1-platform-guide',
      },
      {
        title: '7.0 setup & migration',
        href: '/getting-started/clawql-7-setup-guide',
      },
      {
        title: 'Release manifest (Layer 0)',
        href: '/getting-started/clawql-release-mvp',
      },
      { title: 'Agent setup', href: '/agent-setup' },
      {
        title: 'Cursor iOS + Cloud Agent',
        href: '/getting-started/cursor-ios-cloud-agent',
      },
      { title: 'For teams', href: '/getting-started/for-teams' },
      { title: 'Team vault sync', href: '/getting-started/team-vault-sync' },
      {
        title: 'Golden host (Packer + Pulumi)',
        href: '/getting-started/golden-host-images',
      },
      {
        title: 'Local agent sandbox',
        href: '/getting-started/local-agent-sandbox',
      },
      { title: 'Install', href: '/install' },
      { title: 'MCP clients', href: '/mcp-clients' },
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
      { title: 'Helm chart', href: '/helm' },
      { title: 'OpenClaw', href: '/openclaw' },
      { title: 'Tailscale', href: '/tailscale' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { title: 'Learn hub', href: '/learn' },
      { title: 'Guides', href: '/guides' },
      { title: 'Token efficiency', href: '/architecture/token-efficiency' },
      { title: 'Security', href: '/security' },
      { title: 'Troubleshooting', href: '/troubleshooting' },
    ],
  },
  {
    title: 'Platform',
    links: [
      { title: 'Vision & roadmap', href: '/vision/roadmap' },
      { title: 'Architecture', href: '/architecture' },
      { title: 'Modularization', href: '/vision/modularization' },
      { title: 'IDP platform', href: '/vision/idp-platform' },
      {
        title: 'Immutable releases',
        href: '/vision/immutable-releases',
      },
      { title: 'Ouroboros & DAOS', href: '/ouroboros' },
    ],
  },
  {
    title: 'Reference',
    links: [
      { title: 'Reference', href: '/reference' },
      { title: 'MCP tools', href: '/tools' },
      { title: 'Configuration', href: '/spec-configuration' },
      { title: 'Plugins & registry', href: '/reference/plugins' },
      { title: 'Concepts', href: '/concepts' },
      { title: 'Optional tools', href: '/reference/optional-tools' },
      {
        title: 'Contributor spec',
        href: '/contributing/technical-specification',
      },
      { title: 'Benchmarks', href: '/benchmarks' },
    ],
  },
  {
    title: 'More',
    links: [
      { title: 'Examples', href: '/examples' },
      { title: 'Changelog', href: '/resources/changelog' },
      { title: 'Migration', href: '/resources/migration' },
      {
        title: 'GitHub',
        href: 'https://github.com/danielsmithdevelopment/ClawQL',
      },
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
