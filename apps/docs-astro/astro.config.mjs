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
})
