/**
 * Bulk-import docs content from apps/docs into Astro content collections.
 * Run: node scripts/import-from-next.mjs  (from apps/docs-astro/)
 *
 * Sources: page.mdx routes, generated *-body.mdx, plugin + security-training bodies.
 * JSX/imports are stripped so static Astro MDX builds without Next components.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const astroRoot = path.join(__dirname, '..')
const docsRoot = path.join(astroRoot, '../docs')
const appDir = path.join(docsRoot, 'src/app')
const generatedDir = path.join(docsRoot, 'src/generated')
const outDir = path.join(astroRoot, 'src/content/docs')
const navOut = path.join(astroRoot, 'src/lib/nav.generated.json')

const { GENERATED_BODY_ROUTES } = await import(
  path.join(docsRoot, 'scripts/lib/generated-doc-routes.mjs')
)

const SKIP_ROUTES = new Set([
  '/cache',
  '/schedule',
  '/notify',
  '/kubernetes',
  // Hash-only generated targets — not standalone pages
  '/plugins#plugin-model',
  '/plugins#registry',
  '/agent-setup#cursor-i-os-cloud-agent',
  '/agent-setup#local-agent-sandbox-mac-os-seatbelt',
])

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function routeToSlug(route) {
  if (route === '/') return 'index'
  return route.replace(/^\//, '').replace(/\/$/, '')
}

function stripImportsAndExports(source) {
  let s = source
  // Full import blocks (multi-line)
  s = s.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*\n/gm, '')
  s = s.replace(/^import\s+['"][^'"]+['"];?\s*\n/gm, '')
  s = s.replace(/^export const (dynamic|metadata|sections)\s*=[\s\S]*?(?=\n(?![\s\S]*?\))|\n#|\n---|\n$)/gm, '')
  // Simpler: line-based export const metadata / dynamic
  s = s.replace(/^export const dynamic\s*=\s*[^\n]+\n/gm, '')
  s = s.replace(/^export const sections\s*=\s*[^\n]+\n/gm, '')
  return s.trimStart()
}

function stripJsxBlocks(source) {
  let s = source
  // Remove MDX JSX element blocks (self-closing and paired, naive but good enough)
  s = s.replace(/<[A-Z][A-Za-z0-9.]*\b[^>]*\/>/g, '')
  // Paired tags — non-greedy, repeat
  for (let i = 0; i < 20; i++) {
    const next = s.replace(
      /<[A-Z][A-Za-z0-9.]*\b[^>]*>[\s\S]*?<\/[A-Z][A-Za-z0-9.]*>/g,
      '',
    )
    if (next === s) break
    s = next
  }
  // lowercase div/span with className (hub button rows)
  s = s.replace(/<div\b[^>]*>[\s\S]*?<\/div>/g, '')
  s = s.replace(/\{\{\s*className:[^}]+\}\}/g, '')
  s = s.replace(/<>\s*/g, '').replace(/\s*<\/>/g, '')
  return s
}

function yamlEscape(value) {
  if (/[:#{}[\],&*?|>!%@`]/.test(value) || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return value
}

function extractTitle(md, fallback) {
  const h1 = md.match(/^#\s+(.+)$/m)
  if (h1) return h1[1].replace(/[*_`]/g, '').trim()
  return fallback
}

function extractDescription(md, title) {
  const lines = md
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('|') && !l.startsWith('```'))
  const para = lines.find((l) => l.length > 40 && !l.startsWith('-') && !l.startsWith('*'))
  if (para) {
    return para.replace(/[*_`\[\]]/g, '').slice(0, 220)
  }
  return `${title} — ClawQL documentation`
}

function formatDoc(route, raw, fallbackTitle) {
  let body = stripImportsAndExports(raw)
  body = stripJsxBlocks(body).trim()
  // Drop existing frontmatter from generated files
  if (body.startsWith('---')) {
    const end = body.indexOf('\n---', 3)
    if (end !== -1) body = body.slice(end + 4).trimStart()
  }
  // Keep in-site navigation on the Astro host during preview/cutover.
  body = body.replace(/https:\/\/docs\.clawql\.com\//g, '/')
  const title = extractTitle(body, fallbackTitle || route)
  const description = extractDescription(body, title)
  const absolute =
    route === '/'
      ? `absoluteTitle: ${yamlEscape('ClawQL documentation')}\n`
      : ''
  return `---\ntitle: ${yamlEscape(title)}\ndescription: ${yamlEscape(description)}\n${absolute}---\n\n${body}\n`
}

function writeRoute(route, markdown) {
  if (SKIP_ROUTES.has(route) || route.includes('#')) return false
  const slug = routeToSlug(route)
  const filePath = path.join(outDir, `${slug}.mdx`)
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, markdown, 'utf8')
  return true
}

function collectPageMdx(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name)
    if (name.isDirectory()) {
      if (name.name === 'api' || name.name.startsWith('_')) continue
      collectPageMdx(p, acc)
    } else if (name.name === 'page.mdx') {
      acc.push(p)
    }
  }
  return acc
}

function pagePathToRoute(file) {
  const rel = path.relative(appDir, file).replace(/\\/g, '/')
  const parts = rel.split('/')
  const segs = parts.slice(0, -1)
  if (segs.length === 0) return '/'
  return '/' + segs.join('/')
}

function buildNav(routes) {
  /** @type {Map<string, string>} */
  const titleByHref = new Map()
  for (const [route, md] of routes) {
    let title = extractTitle(md, route)
    if (route === '/') title = 'Home'
    // Prefer short sidebar labels for long H1s
    if (title.includes(' — ')) title = title.split(' — ')[0].trim()
    if (title.includes(': ') && title.length > 48) title = title.split(': ')[0].trim()
    if (title.length > 56) title = title.slice(0, 53) + '…'
    titleByHref.set(route, title)
  }

  const groups = [
    {
      title: 'Getting started',
      prefixes: ['/getting-started', '/quickstart', '/agent-setup', '/mcp-clients', '/install'],
      extra: ['/'],
    },
    {
      title: 'Security',
      prefixes: ['/security'],
    },
    {
      title: 'Deploy',
      prefixes: ['/deployment', '/helm', '/nats-jetstream', '/docker-desktop', '/dashboard-kubernetes', '/openclaw', '/tailscale'],
    },
    {
      title: 'Learn',
      prefixes: ['/learn', '/concepts', '/troubleshooting'],
    },
    {
      title: 'Plugins',
      prefixes: ['/plugins'],
    },
    {
      title: 'Platform',
      prefixes: [
        '/vision',
        '/architecture',
        '/design',
        '/specs',
        '/agents',
        '/bundled-specs',
        '/graphql-proxy',
        '/hitl',
        '/flink',
        '/onyx',
        '/inference',
        '/payments',
        '/surveillance',
        '/streams',
        '/government',
        '/ouroboros',
      ],
    },
    {
      title: 'Reference',
      prefixes: ['/reference', '/tools', '/auth', '/audit', '/observability', '/mcp/', '/spec-configuration', '/contributing'],
    },
    {
      title: 'More',
      prefixes: ['/resources', '/examples', '/case-studies', '/benchmarks', '/archive'],
    },
  ]

  const used = new Set()
  const nav = []

  for (const g of groups) {
    const links = []
    const add = (href) => {
      if (!titleByHref.has(href) || used.has(href)) return
      used.add(href)
      links.push({ title: titleByHref.get(href), href })
    }
    for (const e of g.extra || []) add(e)
    const sorted = [...titleByHref.keys()]
      .filter((href) =>
        g.prefixes.some(
          (p) => href === p || href.startsWith(p + '/') || (p.endsWith('/') && href.startsWith(p)),
        ),
      )
      .sort()
    for (const href of sorted) add(href)
    if (links.length) nav.push({ title: g.title, links })
  }

  // Catch-all remaining
  const rest = [...titleByHref.keys()].filter((h) => !used.has(h)).sort()
  if (rest.length) {
    nav.push({
      title: 'Other',
      links: rest.map((href) => ({ title: titleByHref.get(href), href })),
    })
  }
  return nav
}

function main() {
  // Fresh content dir but keep migration tooling pages if we want — wipe and regenerate
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true })
  }
  ensureDir(outDir)

  /** @type {Map<string, string>} */
  const routeBodies = new Map()
  let written = 0

  // Home
  const homeBody = path.join(appDir, 'home-body.mdx')
  if (fs.existsSync(homeBody)) {
    const md = formatDoc('/', fs.readFileSync(homeBody, 'utf8'), 'ClawQL documentation')
    routeBodies.set('/', md)
  }

  // Generated bodies
  for (const [fileName, route] of Object.entries(GENERATED_BODY_ROUTES)) {
    if (route.includes('#')) continue
    const filePath = path.join(generatedDir, fileName)
    if (!fs.existsSync(filePath)) continue
    const md = formatDoc(route, fs.readFileSync(filePath, 'utf8'), route)
    routeBodies.set(route, md)
  }

  // Plugins
  const pluginsDir = path.join(generatedDir, 'clawql-plugins/bodies')
  if (fs.existsSync(pluginsDir)) {
    for (const name of fs.readdirSync(pluginsDir)) {
      if (!name.endsWith('.mdx')) continue
      const slug = name.replace(/\.mdx$/, '')
      const route = `/plugins/${slug}`
      const md = formatDoc(route, fs.readFileSync(path.join(pluginsDir, name), 'utf8'), slug)
      routeBodies.set(route, md)
    }
  }

  // Security training
  const trainingDir = path.join(generatedDir, 'security-training/bodies')
  if (fs.existsSync(trainingDir)) {
    for (const name of fs.readdirSync(trainingDir)) {
      if (!name.endsWith('.mdx')) continue
      const slug = name.replace(/\.mdx$/, '')
      const route = `/security/best-practices/${slug}`
      const md = formatDoc(route, fs.readFileSync(path.join(trainingDir, name), 'utf8'), slug)
      routeBodies.set(route, md)
    }
  }

  // Hub stubs for interactive Next pages
  routeBodies.set(
    '/plugins',
    formatDoc(
      '/plugins',
      `# Plugins\n\nHome for ClawQL extensions. Browse per-plugin docs under \`/plugins/{slug}\`.\n\nSee also [plugin model](/reference/plugins) and [verticals](/reference/verticals).\n`,
      'Plugins',
    ),
  )
  routeBodies.set(
    '/security/best-practices',
    formatDoc(
      '/security/best-practices',
      `# Agentic AI security best practices\n\nThirty-two vendor-neutral security modules. Open each module under \`/security/best-practices/{slug}\`.\n`,
      'Agentic AI security best practices',
    ),
  )

  // page.mdx (do not overwrite generated routes already set)
  for (const file of collectPageMdx(appDir)) {
    const route = pagePathToRoute(file)
    if (!route || SKIP_ROUTES.has(route)) continue
    if (routeBodies.has(route)) continue
    const md = formatDoc(route, fs.readFileSync(file, 'utf8'), route)
    routeBodies.set(route, md)
  }

  // Migration status page (Astro-specific)
  routeBodies.set(
    '/migration-status',
    formatDoc(
      '/migration-status',
      `# Astro migration status\n\nThis site is the **static Astro** build of ClawQL docs (\`apps/docs-astro\`, ADR 0018). Content is imported from the former Next.js app.\n\n- **Output:** static HTML (no OpenNext / no \`_rsc\` flight URLs)\n- **Host target:** Cloudflare Pages / static assets\n`,
      'Astro migration status',
    ),
  )

  for (const [route, md] of routeBodies) {
    if (writeRoute(route, md)) written++
  }

  console.log(`Wrote ${written} content files to ${path.relative(astroRoot, outDir)}`)
  // Curated nav (docs-nav-data parity) — never auto-title from H1s ("Case study", duplicate "Getting started")
  const navGen = spawnSync(process.execPath, [path.join(__dirname, 'generate-curated-nav.mjs')], {
    stdio: 'inherit',
  })
  if (navGen.status !== 0) process.exit(navGen.status ?? 1)
}

main()
