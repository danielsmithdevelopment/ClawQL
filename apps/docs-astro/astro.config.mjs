import mdx from '@astrojs/mdx'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

/** Static HTML only — no Next RSC / OpenNext Worker flight surface (ADR 0018). */
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://docs.clawql.com',
  output: 'static',
  integrations: [mdx(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },
  // Parity with apps/docs/next.config.mjs redirects (hash destinations flattened).
  redirects: {
    '/reference/plugins': '/plugins',
    '/reference/verticals': '/plugins',
    '/vision/master-enablement': '/architecture',
    '/vision/technical-enablement': '/architecture',
    '/vision/modularization': '/architecture',
    '/vision/ecosystem': '/vision/roadmap',
    '/learn/openclaw-and-clawql': '/openclaw',
    '/kubernetes': '/deployment/kubernetes',
    '/cache': '/learn/cache-handoff-between-chats',
    '/schedule': '/learn/schedule-notify-workflows',
    '/notify': '/learn/schedule-notify-workflows',
    '/case-studies': '/examples',
    '/learn/vault-memory-between-chats': '/learn/memory',
    '/getting-started/cursor-ios-cloud-agent': '/agent-setup',
    '/getting-started/local-agent-sandbox': '/agent-setup',
    '/getting-started/team-vault-sync': '/getting-started/for-teams',
    '/getting-started/golden-host-images': '/getting-started/for-teams',
    '/getting-started/phase-1-platform-guide': '/getting-started',
    '/getting-started/clawql-7-setup-guide': '/getting-started',
    '/resources/migration': '/getting-started',
    '/install': '/quickstart',
    '/readme/getting-started': '/getting-started',
    '/mcp/mcp-tools': '/tools',
    '/getting-started/clawql-desktop': '/agent-setup',
    '/getting-started/clawql-release-mvp': '/vision/immutable-releases',
    '/guides': '/learn',
  },
})
