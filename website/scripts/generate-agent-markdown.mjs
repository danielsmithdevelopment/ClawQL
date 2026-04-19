/**
 * Build step: extract agent-readable Markdown from each app/page.mdx for
 * Accept: text/markdown negotiation (see Cloudflare "Markdown for Agents").
 *
 * Run from website/: node scripts/generate-agent-markdown.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { remark } from 'remark'
import remarkGfm from 'remark-gfm'
import remarkMdx from 'remark-mdx'
import { visit } from 'unist-util-visit'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.join(__dirname, '../src/app')
const outFile = path.join(__dirname, '../src/generated/agent-markdown.json')

function stripImportsAndExports(source) {
  let s = source

  // import ... (optional semicolon)
  s = s.replace(/^import\s+[^\n]+\n/gm, '')

  // export const metadata = docsPageMetadata( ... );
  s = stripFunctionCallExport(s, 'metadata', 'docsPageMetadata')

  // export const sections = ... (single line)
  s = s.replace(/^export const sections\s*=[^\n]+\n/m, '')

  return s.trimStart()
}

/** Remove `export const name = callee( ... )` including nested parens/braces/strings. */
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

function routeToSlug(route) {
  if (route === '/') return 'index'
  return route.slice(1).replace(/\//g, '__')
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

function main() {
  const files = collectMdxFiles(appDir)
  const map = {}

  for (const file of files) {
    const route = pagePathToRoute(file)
    if (!route) continue
    const raw = fs.readFileSync(file, 'utf8')
    const stripped = stripImportsAndExports(raw)
    let md
    try {
      md = mdxToMarkdown(stripped)
    } catch (e) {
      console.warn(
        `remark failed for ${file}, using stripped source:`,
        e.message,
      )
      md = stripped
    }
    md = md.trim()
    const titleMatch = md.match(/^#\s+(.+)$/m)
    const title = titleMatch ? titleMatch[1].trim() : 'ClawQL documentation'
    if (!md.startsWith('---')) {
      md = `---\ntitle: ${title}\n---\n\n` + md
    }
    map[route] = md
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, JSON.stringify(map, null, 0), 'utf8')
  console.log(
    `Wrote ${Object.keys(map).length} routes to ${path.relative(process.cwd(), outFile)}`,
  )
}

main()
