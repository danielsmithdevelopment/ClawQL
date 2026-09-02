/**
 * Builds a searchable catalog of docs routes that are intentionally off the
 * first-run sidebar. Source of truth: app routes + plugin/training sitemaps
 * minus docsNavigation hrefs.
 *
 * Output: src/generated/docs-archive.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import glob from 'fast-glob'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const appDir = path.join(websiteRoot, 'src/app')
const outPath = path.join(websiteRoot, 'src/generated/docs-archive.json')
const navPath = path.join(websiteRoot, 'src/lib/docs-nav-data.ts')

/** Permanent redirects — still listed under Legacy so old URLs are findable. */
const REDIRECT_SOURCES = new Set(['/cache', '/schedule', '/notify'])

const REDIRECT_DEST = {
  '/cache': '/learn/cache-handoff-between-chats',
  '/schedule': '/learn/schedule-notify-workflows',
  '/notify': '/learn/schedule-notify-workflows',
}

/** Prefer these titles when metadata/H1 parsing is weak. */
const TITLE_OVERRIDES = {
  '/benchmarks/executor-comparison': 'Benchmarks — executor comparison',
  '/onyx-knowledge': 'Onyx knowledge (legacy path)',
  '/design/operator-target-architecture': 'Operator target architecture',
  '/deployment/platforms': 'Deployment platforms',
  '/resources': 'Resources hub',
  '/ouroboros/daos': 'DAOS unified architecture',
  '/ouroboros/specification': 'DAOS coordination specification',
  '/ouroboros/build-plan': 'DAOS build plan',
  '/specs/cq-extensions/cqe': '.cqe — Effect contracts',
  '/specs/cq-extensions/cqm': '.cqm — memory / OKF',
  '/specs/cq-extensions/cqk': '.cqk — knowledge',
  '/specs/cq-extensions/cqw': '.cqw — workflows',
  '/reference/hitl': 'HITL reference',
  '/reference/verticals': 'Verticals reference',
}

const GROUP_ORDER = [
  'Platform',
  'Plugins',
  'Learn',
  'Deploy',
  'Security',
  'Reference',
  'Vision',
  'Examples',
  'Getting started',
  'Ouroboros',
  'Specs',
  'MCP',
  'Resources',
  'Legacy redirects',
  'Other',
]

function groupForHref(href) {
  if (REDIRECT_SOURCES.has(href)) return 'Legacy redirects'
  if (href.startsWith('/plugins')) return 'Plugins'
  if (href.startsWith('/learn')) return 'Learn'
  if (
    href.startsWith('/deployment') ||
    href === '/helm' ||
    href === '/tailscale'
  )
    return 'Deploy'
  if (href.startsWith('/security')) return 'Security'
  if (
    href.startsWith('/reference') ||
    href === '/tools' ||
    href === '/spec-configuration'
  )
    return 'Reference'
  if (href.startsWith('/mcp/')) return 'MCP'
  if (href.startsWith('/vision') || href.startsWith('/architecture'))
    return 'Vision'
  if (
    href.startsWith('/case-studies') ||
    href.startsWith('/benchmarks') ||
    href === '/examples'
  )
    return 'Examples'
  if (href.startsWith('/getting-started')) return 'Getting started'
  if (href.startsWith('/ouroboros')) return 'Ouroboros'
  if (href.startsWith('/specs')) return 'Specs'
  if (href.startsWith('/resources')) return 'Resources'
  if (
    href.startsWith('/surveillance') ||
    href.startsWith('/streams') ||
    href.startsWith('/government') ||
    href === '/hitl-label-studio' ||
    href === '/onyx-knowledge' ||
    href === '/flink-onyx-sync' ||
    href === '/nats-jetstream' ||
    href === '/graphql-proxy' ||
    href === '/bundled-specs' ||
    href === '/docker-desktop-observability' ||
    href === '/dashboard-kubernetes' ||
    href.startsWith('/design')
  ) {
    return 'Platform'
  }
  return 'Other'
}

function humanizePath(href) {
  const leaf = href.split('/').filter(Boolean).pop() || 'home'
  return leaf.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function loadJsonArray(rel) {
  const p = path.join(websiteRoot, rel)
  if (!fs.existsSync(p)) return []
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function parseSidebarHrefs(source) {
  const hrefs = new Set()
  for (const match of source.matchAll(/href:\s*'(\/[^']*)'/g)) {
    const href = match[1].split('#')[0]
    hrefs.add(href)
  }
  // Security training modules come from the generated registry (not string literals).
  if (hrefs.has('/security') || hrefs.has('/security/best-practices')) {
    hrefs.add('/security/defense-in-depth')
    for (const p of loadJsonArray(
      'src/generated/security-training/sitemap-paths.json',
    )) {
      hrefs.add(p)
    }
  }
  return hrefs
}

function collectHubMeta() {
  const map = new Map()
  const files = [
    path.join(websiteRoot, 'src/lib/docs-hub-data.ts'),
    path.join(websiteRoot, 'src/lib/docs-site-card-data.ts'),
  ]
  for (const file of files) {
    if (!fs.existsSync(file)) continue
    const src = fs.readFileSync(file, 'utf8')
    const blocks = src.split(/href:\s*'(\/[^']*)'/)
    for (let i = 1; i < blocks.length; i += 2) {
      const href = blocks[i].split('#')[0]
      const rest = blocks[i + 1] ?? ''
      const name = rest
        .match(/name:\s*'((?:\\'|[^'])*)'/)?.[1]
        ?.replace(/\\'/g, "'")
      const description = rest
        .match(/description:\s*'((?:\\'|[^'])*)'/)?.[1]
        ?.replace(/\\'/g, "'")
      if (name || description) {
        map.set(href, {
          title: name || map.get(href)?.title,
          description: description || map.get(href)?.description,
        })
      }
    }
  }
  return map
}

function titleFromPageFiles(href) {
  const rel = href === '/' ? '' : href.slice(1)
  const base = path.join(appDir, rel)
  const candidates = [
    path.join(base, 'page.tsx'),
    path.join(base, 'page.mdx'),
    path.join(base, 'layout.tsx'),
  ]
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue
    const src = fs.readFileSync(file, 'utf8')
    const metaTitle = src
      .match(/title:\s*'((?:\\'|[^'])*)'/)?.[1]
      ?.replace(/\\'/g, "'")
    if (metaTitle) return metaTitle.split('—')[0].split(' - ')[0].trim()
    const h1 = src.match(/^#\s+(.+)$/m)?.[1]?.trim()
    if (h1) return h1.replace(/\{\{.*\}\}/, '').trim()
  }
  return null
}

function walkStaticAppRoutes() {
  const files = glob.sync('**/page.{mdx,tsx,md}', { cwd: appDir })
  const routes = new Set()
  for (const file of files) {
    const url =
      '/' +
      file
        .replace(/(^|\/)page\.(mdx|tsx|md)$/, '')
        .replace(/\\/g, '/')
        .replace(/\/$/, '')
    if (url.includes('[')) continue
    routes.add(url === '/' ? '/' : url.replace(/\/$/, '') || '/')
  }
  return routes
}

function build() {
  const sidebar = parseSidebarHrefs(fs.readFileSync(navPath, 'utf8'))
  const hubMeta = collectHubMeta()
  const routes = walkStaticAppRoutes()

  for (const p of loadJsonArray(
    'src/generated/clawql-plugins/sitemap-paths.json',
  )) {
    routes.add(p)
  }
  for (const p of loadJsonArray(
    'src/generated/security-training/sitemap-paths.json',
  )) {
    routes.add(p)
  }

  /** @type {Array<{ href: string, title: string, description: string, group: string, redirectTo?: string }>} */
  const entries = []

  for (const href of [...routes].sort()) {
    if (href === '/') continue
    if (href === '/archive') continue
    if (sidebar.has(href)) continue

    const hub = hubMeta.get(href)
    const title =
      TITLE_OVERRIDES[href] ||
      hub?.title ||
      titleFromPageFiles(href) ||
      humanizePath(href)
    const description =
      hub?.description ||
      (REDIRECT_SOURCES.has(href) ? `Redirects to ${REDIRECT_DEST[href]}` : '')

    entries.push({
      href,
      title,
      description,
      group: groupForHref(href),
      ...(REDIRECT_DEST[href] ? { redirectTo: REDIRECT_DEST[href] } : {}),
    })
  }

  const groups = GROUP_ORDER.map((name) => ({
    name,
    entries: entries.filter((e) => e.group === name),
  })).filter((g) => g.entries.length > 0)

  const payload = {
    generatedAt: new Date().toISOString(),
    sidebarHrefCount: sidebar.size,
    entryCount: entries.length,
    groups,
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(
    `generate-docs-archive: ${entries.length} off-sidebar routes → ${path.relative(websiteRoot, outPath)}`,
  )
  return payload
}

build()
