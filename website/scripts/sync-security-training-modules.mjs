/**
 * Syncs docs/security/security-best-practices-series/*.md into src/generated/security-training/
 * for /security/best-practices/<slug>. Strips YAML frontmatter; rewrites relative repo links for the site.
 *
 * Source: docs/security/security-best-practices-series/NN-slug.md
 *   → src/generated/security-training/bodies/<slug>.mdx
 *   → src/generated/security-training/registry.tsx
 *
 * Run from website/: node scripts/sync-security-training-modules.mjs
 * (also wired into prebuild / dev.)
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { appendPassthroughWrapper } from './lib/rewrite-doc-links.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstRoot = path.join(websiteRoot, 'src/generated/security-training')
const bodiesDir = path.join(dstRoot, 'bodies')
const registryPath = path.join(dstRoot, 'registry.tsx')
const seriesRelative = path.join(
  'docs',
  'security',
  'security-best-practices-series',
)

const GH_MAIN = 'https://github.com/danielsmithdevelopment/ClawQL/blob/main'

function findRepoRootWithSeries() {
  let dir = websiteRoot
  for (let i = 0; i < 10; i++) {
    const p = path.join(dir, seriesRelative)
    if (fs.existsSync(p)) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/** Avoid MDX interpreting `<50ms`-style text as JSX tags. */
function escapeLessThanBeforeDigit(body) {
  return body.replace(/<(?=\d)/g, '&lt;')
}

/** Escape `{` / `}` outside fenced code blocks so JSON/YAML examples compile as MDX. */
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

/** Map relative Markdown links to absolute GitHub blob URLs (same spirit as defense-in-depth sync). */
function rewriteLinksForSite(body) {
  return escapeMdxCurlyOutsideFences(
    escapeLessThanBeforeDigit(
    body
      .replaceAll('](../../charts/', `](${GH_MAIN}/charts/`)
      .replaceAll('](../../docs/', `](${GH_MAIN}/docs/`)
      .replaceAll('](../../docker/', `](${GH_MAIN}/docker/`)
      .replaceAll('](../../AGENTS.md)', `](${GH_MAIN}/AGENTS.md)`)
      .replaceAll('](../', `](${GH_MAIN}/docs/security/`),
    ),
  )
}

/**
 * @param {string} raw full file
 * @returns {{ fm: Record<string, string>, body: string }}
 */
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
  /** @type {Record<string, string>} */
  const fm = {}
  let inTags = false
  for (const line of block.split('\n')) {
    if (inTags) {
      if (/^\s+-\s/.test(line)) continue
      if (/^\S/.test(line)) inTags = false
      else continue
    }
    if (/^tags:\s*$/.test(line)) {
      inTags = true
      continue
    }
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

function trainingMdFilter(name) {
  return /^\d{2}-.+\.md$/.test(name) && !name.startsWith('_')
}

const repoRoot = findRepoRootWithSeries()
const seriesDir = repoRoot ? path.join(repoRoot, seriesRelative) : null

if (!seriesDir || !fs.existsSync(seriesDir)) {
  if (fs.existsSync(registryPath)) {
    console.warn(
      'sync-security-training-modules: series dir missing; keeping existing src/generated/security-training (Docker ./website context).',
    )
    process.exit(0)
  }
  console.error(
    'sync-security-training-modules: missing source and no generated registry at',
    registryPath,
  )
  process.exit(1)
}

const names = fs
  .readdirSync(seriesDir)
  .filter((n) => trainingMdFilter(n))
  .sort()

/** @type {Array<{ file: string, slug: string, fm: Record<string, string>, body: string }>} */
const modules = []
for (const file of names) {
  const raw = fs.readFileSync(path.join(seriesDir, file), 'utf8')
  const { fm, body } = splitFrontmatter(raw)
  const slugFromFile = file.replace(/^\d{2}-/, '').replace(/\.md$/, '')
  const slug = (fm.slug || slugFromFile).trim()
  if (slug !== slugFromFile) {
    console.warn(
      `sync-security-training-modules: ${file}: slug "${slug}" vs filename "${slugFromFile}" — using frontmatter slug.`,
    )
  }
  const title = fm.title || slug
  const description = fm.description || `Security training module: ${title}.`
  const part = fm.part || file.slice(0, 2)
  const totalParts = fm.total_parts || '20'
  const prev = fm.prev?.trim() || ''
  const next = fm.next?.trim() || ''
  modules.push({
    file,
    slug,
    fm: { title, description, part, total_parts: totalParts, prev, next },
    body: appendPassthroughWrapper(rewriteLinksForSite(body.trimStart())),
  })
}

fs.mkdirSync(bodiesDir, { recursive: true })

for (const m of modules) {
  const out = path.join(bodiesDir, `${m.slug}.mdx`)
  fs.writeFileSync(out, m.body, 'utf8')
  execSync(`npx prettier --write "${path.relative(websiteRoot, out)}"`, {
    cwd: websiteRoot,
    stdio: 'inherit',
  })
}

const esc = (s) =>
  s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ')

const importLines = modules.map(
  (m, i) => `import Body${i} from './bodies/${m.slug}.mdx'`,
)

const mapEntries = modules.map(
  (m, i) => `  '${m.slug}': Body${i},`,
)

const metaLines = modules.map((m) => {
  const { title, description, part, total_parts, prev, next } = m.fm
  return `  {
    slug: '${m.slug}',
    title: '${esc(title)}',
    description: '${esc(description)}',
    part: ${Number(part) || 1},
    totalParts: ${Number(total_parts) || 20},
    prev: ${prev ? `'${prev}'` : 'null'},
    next: ${next ? `'${next}'` : 'null'},
  },`
})

const registrySource = `import type { ComponentType } from 'react'

${importLines.join('\n')}

export type TrainingModuleMeta = {
  slug: string
  title: string
  description: string
  part: number
  totalParts: number
  prev: string | null
  next: string | null
}

export const trainingModules: TrainingModuleMeta[] = [
${metaLines.join('\n')}
]

export const trainingBodies: Record<string, ComponentType> = {
${mapEntries.join('\n')}
}

export function getTrainingMeta(slug: string): TrainingModuleMeta | undefined {
  return trainingModules.find((m) => m.slug === slug)
}
`

fs.writeFileSync(registryPath, registrySource, 'utf8')
execSync(`npx prettier --write "${path.relative(websiteRoot, registryPath)}"`, {
  cwd: websiteRoot,
  stdio: 'inherit',
})

const sitemapPaths = [
  '/security/best-practices',
  ...modules.map((m) => `/security/best-practices/${m.slug}`),
]
fs.writeFileSync(
  path.join(dstRoot, 'sitemap-paths.json'),
  `${JSON.stringify(sitemapPaths, null, 2)}\n`,
  'utf8',
)

console.log(
  `sync-security-training-modules: wrote ${modules.length} bodies + registry + sitemap-paths.json`,
)
