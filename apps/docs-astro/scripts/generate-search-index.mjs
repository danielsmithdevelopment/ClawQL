/**
 * Build FlexSearch source chunks for docs-astro (lazy-loaded per top path segment).
 * Indexes all MDX under src/content/docs after import-from-next.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const astroRoot = path.join(__dirname, '..')
const contentDir = path.join(astroRoot, 'src/content/docs')
const outDir = path.join(astroRoot, 'public/search-index')

function walkMdx(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name)
    if (name.isDirectory()) walkMdx(p, acc)
    else if (name.name.endsWith('.mdx')) acc.push(p)
  }
  return acc
}

function stripFrontmatter(src) {
  if (!src.startsWith('---')) return src
  const end = src.indexOf('\n---', 3)
  if (end === -1) return src
  return src.slice(end + 4)
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * @returns {Array<[title: string, hash: string|null, content: string[]]>}
 */
function extractSections(mdx) {
  const body = stripFrontmatter(mdx)
  const lines = body.split('\n')
  /** @type {Array<[string, string|null, string[]]>} */
  const sections = []
  let current = null

  const flushPara = (buf) => {
    const text = buf.join(' ').replace(/\s+/g, ' ').trim()
    if (text && current) current[2].push(text)
  }

  let para = []
  for (const raw of lines) {
    const line = raw.trimEnd()
    const heading = line.match(/^(#{1,2})\s+(.+)$/)
    if (heading) {
      flushPara(para)
      para = []
      const depth = heading[1].length
      const title = heading[2].replace(/[`*_]/g, '').trim()
      if (!title) continue
      const hash = depth === 1 ? null : slugify(title)
      current = [title, hash, []]
      sections.push(current)
      continue
    }
    if (!line.trim() || line.startsWith('```') || line.startsWith('|')) {
      flushPara(para)
      para = []
      continue
    }
    if (line.startsWith('!') || line.startsWith('<')) continue
    const cleaned = line
      .replace(/^[-*+]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[`*_~>]/g, '')
      .trim()
    if (cleaned) para.push(cleaned)
  }
  flushPara(para)

  if (sections.length === 0) {
    sections.push(['Untitled', null, []])
  }
  return sections
}

function fileToUrl(file) {
  const rel = path.relative(contentDir, file).replace(/\\/g, '/')
  if (rel === 'index.mdx') return '/'
  return '/' + rel.replace(/\.mdx$/, '')
}

function chunkIdForUrl(url) {
  const pathname = url.split(/[?#]/, 1)[0] ?? url
  const segment = pathname.split('/').filter(Boolean)[0]
  return segment ?? 'root'
}

fs.mkdirSync(outDir, { recursive: true })
for (const name of fs.readdirSync(outDir)) {
  if (name.startsWith('chunk-') && name.endsWith('.json')) {
    fs.unlinkSync(path.join(outDir, name))
  }
}

const pages = []
for (const file of walkMdx(contentDir)) {
  const url = fileToUrl(file)
  const mdx = fs.readFileSync(file, 'utf8')
  pages.push({ url, sections: extractSections(mdx) })
}

/** @type {Map<string, typeof pages>} */
const chunks = new Map()
for (const page of pages) {
  const id = chunkIdForUrl(page.url)
  if (!chunks.has(id)) chunks.set(id, [])
  chunks.get(id).push(page)
}

const manifestChunks = []
for (const [id, chunkPages] of [...chunks.entries()].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  const safeId = id.replace(/[^a-zA-Z0-9._-]+/g, '-')
  const fileName = `chunk-${safeId}.json`
  fs.writeFileSync(
    path.join(outDir, fileName),
    `${JSON.stringify(chunkPages)}\n`,
    'utf8',
  )
  manifestChunks.push({ id: safeId, file: fileName, pages: chunkPages.length })
}

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  chunks: manifestChunks,
  totalPages: pages.length,
}
fs.writeFileSync(
  path.join(outDir, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
)

console.log(
  `generate-search-index: ${pages.length} pages in ${manifestChunks.length} chunks → public/search-index/`,
)
