/**
 * Syncs docs/plugins/*.md into src/generated/clawql-plugins/
 * for /plugins and /plugins/<slug>.
 *
 * Source: docs/plugins/<slug>.md
 *   → src/generated/clawql-plugins/bodies/<slug>.mdx
 *   → src/generated/clawql-plugins/registry.tsx
 *   → src/generated/clawql-plugins/sitemap-paths.json
 *
 * Run from website/: node scripts/sync-clawql-plugin-pages.mjs
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstRoot = path.join(websiteRoot, 'src/generated/clawql-plugins')
const bodiesDir = path.join(dstRoot, 'bodies')
const registryPath = path.join(dstRoot, 'registry.tsx')
const pluginsRelative = path.join('docs', 'plugins')
const GH_MAIN = 'https://github.com/danielsmithdevelopment/ClawQL/blob/main'

function findRepoRootWithPlugins() {
  let dir = websiteRoot
  for (let i = 0; i < 10; i++) {
    const p = path.join(dir, pluginsRelative)
    if (fs.existsSync(p)) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function escapeLessThanBeforeDigit(body) {
  return body.replace(/<(?=\d)/g, '&lt;')
}

function escapeMdxCurlyOutsideFences(body) {
  const lines = body.split('\n')
  let inFence = false
  return lines
    .map((line) => {
      const fence = line.match(/^(`{3,}|~{3,})(.*)$/)
      if (fence) {
        if (!inFence) inFence = true
        else if (!fence[2].trim()) inFence = false
        return line
      }
      if (inFence) return line
      return line
        .replace(/\\/g, '\\\\')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}')
    })
    .join('\n')
}

function rewriteLinksForSite(body) {
  return escapeMdxCurlyOutsideFences(
    escapeLessThanBeforeDigit(
      body
        .replaceAll('](../reference/clawql-plugin-registry.md)', '](/reference/plugins)')
        .replaceAll('](../design/clawql-plugin-model.md)', '](/reference/plugins#plugin-model)')
        .replaceAll('](../mcp/mcp-tools.md)', '](/tools)')
        .replaceAll('](../getting-started/', '](/getting-started/')
        .replace(/]\(\/getting-started\/([^)#]+)\.md/g, '](/getting-started/$1')
        .replaceAll('](../../docs/', `](${GH_MAIN}/docs/`)
        .replaceAll('](../', `](${GH_MAIN}/docs/plugins/`),
    ),
  )
}

function splitFrontmatter(raw) {
  if (!raw.startsWith('---\n')) {
    return { fm: {}, body: raw }
  }
  const end = raw.indexOf('\n---\n', 4)
  if (end === -1) {
    return { fm: {}, body: raw }
  }
  const block = raw.slice(4, end)
  const body = raw.slice(end + 5)
  const fm = {}
  for (const line of block.split('\n')) {
    const m = /^([a-zA-Z0-9_]+):\s*(.*)$/.exec(line)
    if (!m) continue
    let v = m[2].trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    fm[m[1]] = v
  }
  return { fm, body }
}

const repoRoot = findRepoRootWithPlugins()
const pluginsDir = repoRoot ? path.join(repoRoot, pluginsRelative) : null

if (!pluginsDir || !fs.existsSync(pluginsDir)) {
  if (fs.existsSync(registryPath)) {
    console.warn(
      'sync-clawql-plugin-pages: docs/plugins missing; keeping existing src/generated/clawql-plugins',
    )
    process.exit(0)
  }
  console.error(
    'sync-clawql-plugin-pages: missing source and no generated registry at',
    registryPath,
  )
  process.exit(1)
}

const names = fs
  .readdirSync(pluginsDir)
  .filter((n) => n.endsWith('.md') && n !== 'README.md')
  .sort()

/** @type {Array<{ slug: string, fm: Record<string, string>, body: string }>} */
const plugins = []
for (const file of names) {
  const raw = fs.readFileSync(path.join(pluginsDir, file), 'utf8')
  const { fm, body } = splitFrontmatter(raw)
  const slugFromFile = file.replace(/\.md$/, '')
  const slug = (fm.slug || slugFromFile).trim()
  const title = fm.title || slug
  const description = fm.description || `ClawQL plugin: ${title}.`
  const status = fm.status || 'shipped'
  const pkg = fm.package || ''
  const order = Number(fm.order) || 99
  const prev = fm.prev?.trim() || ''
  const next = fm.next?.trim() || ''
  plugins.push({
    slug,
    fm: { title, description, status, package: pkg, order: String(order), prev, next },
    body: rewriteLinksForSite(body.trimStart()),
  })
}

plugins.sort((a, b) => Number(a.fm.order) - Number(b.fm.order))

fs.mkdirSync(bodiesDir, { recursive: true })

for (const p of plugins) {
  const out = path.join(bodiesDir, `${p.slug}.mdx`)
  fs.writeFileSync(out, p.body, 'utf8')
  execSync(`npx prettier --write "${path.relative(websiteRoot, out)}"`, {
    cwd: websiteRoot,
    stdio: 'inherit',
  })
}

const esc = (s) =>
  s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ')

const importLines = plugins.map(
  (p, i) => `import Body${i} from './bodies/${p.slug}.mdx'`,
)

const mapEntries = plugins.map((p, i) => `  '${p.slug}': Body${i},`)

const metaLines = plugins.map((p) => {
  const { title, description, status, package: pkg, prev, next } = p.fm
  return `  {
    slug: '${p.slug}',
    title: '${esc(title)}',
    description: '${esc(description)}',
    status: '${esc(status)}',
    package: ${pkg ? `'${esc(pkg)}'` : 'null'},
    prev: ${prev ? `'${prev}'` : 'null'},
    next: ${next ? `'${next}'` : 'null'},
  },`
})

const registrySource = `import type { ComponentType } from 'react'

${importLines.join('\n')}

export type PluginPageMeta = {
  slug: string
  title: string
  description: string
  status: string
  package: string | null
  prev: string | null
  next: string | null
}

export const pluginPages: PluginPageMeta[] = [
${metaLines.join('\n')}
]

export const pluginBodies: Record<string, ComponentType> = {
${mapEntries.join('\n')}
}

export function getPluginMeta(slug: string): PluginPageMeta | undefined {
  return pluginPages.find((p) => p.slug === slug)
}
`

fs.writeFileSync(registryPath, registrySource, 'utf8')
execSync(`npx prettier --write "${path.relative(websiteRoot, registryPath)}"`, {
  cwd: websiteRoot,
  stdio: 'inherit',
})

const sitemapPaths = [
  '/plugins',
  ...plugins.map((p) => `/plugins/${p.slug}`),
]
fs.writeFileSync(
  path.join(dstRoot, 'sitemap-paths.json'),
  `${JSON.stringify(sitemapPaths, null, 2)}\n`,
  'utf8',
)

console.log(
  `sync-clawql-plugin-pages: wrote ${plugins.length} bodies + registry + sitemap-paths.json`,
)
