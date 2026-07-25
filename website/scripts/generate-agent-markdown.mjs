/**
 * Build step: extract agent-readable Markdown for content negotiation middleware.
 * Indexes page.mdx routes, generated doc bodies, plugin pages, security training,
 * and the home page body.
 *
 * Run from website/: node scripts/generate-agent-markdown.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import glob from 'fast-glob'
import { remark } from 'remark'
import remarkGfm from 'remark-gfm'
import remarkMdx from 'remark-mdx'
import { visit } from 'unist-util-visit'

import { GENERATED_BODY_ROUTES } from './lib/generated-doc-routes.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.join(__dirname, '..')
const appDir = path.join(websiteRoot, 'src/app')
const generatedDir = path.join(websiteRoot, 'src/generated')
const pluginsBodiesDir = path.join(
  websiteRoot,
  'src/generated/clawql-plugins/bodies',
)
const trainingDir = path.join(
  websiteRoot,
  'src/generated/security-training/bodies',
)
const outFile = path.join(websiteRoot, 'public/agent-markdown.json')

/** Redirect-only routes — canonical content lives elsewhere. */
const SKIP_ROUTES = new Set(['/cache', '/schedule', '/notify', '/kubernetes'])

function stripImportsAndExports(source) {
  let s = source
  s = s.replace(/^import\s+[^\n]+\n/gm, '')
  s = stripFunctionCallExport(s, 'metadata', 'docsPageMetadata')
  s = s.replace(/^export const sections\s*=[^\n]+\n/m, '')
  return s.trimStart()
}

function stripFunctionCallExport(source, exportName, callee) {
  const needle = `export const ${exportName} = ${callee}`
  const start = source.indexOf(needle)
  if (start === -1) return source

  let i = start + needle.length
  while (i < source.length && /\s/.test(source[i])) i++
  if (i >= source.length || source[i] !== '(') return source

  const bodyStart = i
  let depth = 0
  let inS = null
  let escape = false
  for (i = bodyStart; i < source.length; i++) {
    const c = source[i]
    if (inS) {
      if (escape) escape = false
      else if (c === '\\') escape = true
      else if (c === inS) inS = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      inS = c
      continue
    }
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) {
        i++
        while (i < source.length && /\s/.test(source[i])) i++
        if (i < source.length && source[i] === ';') i++
        return source.slice(0, start) + source.slice(i)
      }
    }
  }
  return source
}

function stripMdxExpressionsAndJsx() {
  return (tree) => {
    const toRemove = []
    visit(tree, (node, index, parent) => {
      if (!parent || typeof index !== 'number') return
      if (
        node.type === 'mdxFlowExpression' ||
        node.type === 'mdxTextExpression' ||
        node.type === 'mdxJsxFlowElement' ||
        node.type === 'mdxJsxTextElement' ||
        node.type === 'mdxjsEsm'
      ) {
        toRemove.push([parent, index])
      }
    })
    for (const [parent, index] of toRemove.sort((a, b) => b[1] - a[1])) {
      parent.children.splice(index, 1)
    }
  }
}

function mdxToMarkdown(mdxSource) {
  const processor = remark()
    .use(remarkMdx, { format: 'mdx' })
    .use(remarkGfm)
    .use(stripMdxExpressionsAndJsx)

  const file = processor.runSync(processor.parse(mdxSource))
  return remark().use(remarkGfm).stringify(file)
}

function pagePathToRoute(file) {
  const rel = path.relative(appDir, file).replace(/\\/g, '/')
  const parts = rel.split('/')
  if (parts[parts.length - 1] !== 'page.mdx') return null
  const segs = parts.slice(0, -1)
  if (segs.length === 0 || (segs.length === 1 && segs[0] === '')) return '/'
  return '/' + segs.join('/')
}

function formatMarkdown(route, rawMdx, label = 'ClawQL documentation') {
  const stripped = stripImportsAndExports(rawMdx)
  let md
  try {
    md = mdxToMarkdown(stripped)
  } catch (e) {
    console.warn(`remark failed for ${route}, using stripped source:`, e.message)
    md = stripped
  }
  md = md.trim()
  const titleMatch = md.match(/^#\s+(.+)$/m)
  const title = titleMatch ? titleMatch[1].trim() : label
  if (!md.startsWith('---')) {
    md = `---\ntitle: ${title}\n---\n\n` + md
  }
  return md
}

function collectMdxFiles(dir, acc = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name)
    if (name.isDirectory()) {
      if (name.name === 'api' || name.name.startsWith('_')) continue
      collectMdxFiles(p, acc)
    } else if (name.name === 'page.mdx') {
      acc.push(p)
    }
  }
  return acc
}

function addGeneratedBodies(map) {
  for (const [fileName, route] of Object.entries(GENERATED_BODY_ROUTES)) {
    const filePath = path.join(generatedDir, fileName)
    if (!fs.existsSync(filePath)) continue
    const raw = fs.readFileSync(filePath, 'utf8')
    map[route] = formatMarkdown(route, raw)
  }
}

function addPluginBodies(map) {
  if (!fs.existsSync(pluginsBodiesDir)) return
  const pluginFiles = glob.sync('*.mdx', { cwd: pluginsBodiesDir })
  for (const fileName of pluginFiles) {
    const slug = fileName.replace(/\.mdx$/, '')
    const route = `/plugins/${slug}`
    const raw = fs.readFileSync(path.join(pluginsBodiesDir, fileName), 'utf8')
    map[route] = formatMarkdown(route, raw)
  }
}

function addTrainingBodies(map) {
  if (!fs.existsSync(trainingDir)) return
  const trainingFiles = glob.sync('*.mdx', { cwd: trainingDir })
  for (const fileName of trainingFiles) {
    const slug = fileName.replace(/\.mdx$/, '')
    const route = `/security/best-practices/${slug}`
    const raw = fs.readFileSync(path.join(trainingDir, fileName), 'utf8')
    map[route] = formatMarkdown(route, raw)
  }
}

function addHomeBody(map) {
  const homeBody = path.join(appDir, 'home-body.mdx')
  if (!fs.existsSync(homeBody)) return
  const raw = fs.readFileSync(homeBody, 'utf8')
  map['/'] = formatMarkdown('/', raw, 'ClawQL documentation')
}

function addHubPages(map) {
  map['/plugins'] =
    '---\ntitle: Plugins\n---\n\n# Plugins\n\nClawQL plugin registry: horizontal packages, MCP proxies, and domain verticals (lending, legal, healthcare, …) on the same Plugin.onRegister model. Use the searchable registry on /plugins#registry (kind + status filters). Per-plugin docs under /plugins/{slug}; verticals guide at /reference/verticals.\n'

  map['/security/best-practices'] =
    '---\ntitle: Agentic AI security best practices\n---\n\n# Agentic AI security best practices\n\nThirty-two vendor-neutral security modules synced from the repo security-best-practices-series. See /security/best-practices/{slug} for each module.\n'
}

function main() {
  const map = {}

  addHomeBody(map)
  addGeneratedBodies(map)
  addPluginBodies(map)
  addTrainingBodies(map)
  addHubPages(map)

  const files = collectMdxFiles(appDir)
  for (const file of files) {
    const route = pagePathToRoute(file)
    if (!route || SKIP_ROUTES.has(route)) continue
    if (map[route] !== undefined) continue
    const raw = fs.readFileSync(file, 'utf8')
    map[route] = formatMarkdown(route, raw)
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, JSON.stringify(map, null, 0), 'utf8')
  console.log(
    `Wrote ${Object.keys(map).length} routes to ${path.relative(process.cwd(), outFile)}`,
  )
}

main()
