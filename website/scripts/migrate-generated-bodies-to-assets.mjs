#!/usr/bin/env node
/**
 * Rewrite pages that `import … from '@/generated/*-body.mdx'` to use
 * AgentMarkdownDocBody (ASSETS-backed) so OpenNext Worker JS stays under 3 MiB.
 *
 * Run from website/: node scripts/migrate-generated-bodies-to-assets.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { GENERATED_BODY_ROUTES } from './lib/generated-doc-routes.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const appDir = path.join(websiteRoot, 'src/app')

/** Extra page files that import generated bodies but are not in GENERATED_BODY_ROUTES keys 1:1 */
const EXTRA_PAGES = [
  {
    file: 'getting-started/immutable-releases/page.tsx',
    importName: 'GettingStartedImmutableReleasesBody',
    bodyFile: 'getting-started-immutable-releases-body.mdx',
    route: '/getting-started/immutable-releases',
  },
  {
    file: 'mcp/protocol-fabric/page.tsx',
    importName: 'ProtocolFabricBody',
    bodyFile: 'protocol-fabric-body.mdx',
    route: '/mcp/protocol-fabric',
  },
]

function walkPages(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walkPages(p, out)
    else if (ent.name === 'page.tsx') out.push(p)
  }
  return out
}

function routeForBodyFile(bodyFile) {
  if (GENERATED_BODY_ROUTES[bodyFile]) {
    // Strip hash fragments for map lookup (agent-markdown uses path only)
    return GENERATED_BODY_ROUTES[bodyFile].split('#')[0]
  }
  const extra = EXTRA_PAGES.find((e) => e.bodyFile === bodyFile)
  return extra?.route ?? null
}

const pages = walkPages(appDir)
let changed = 0

for (const file of pages) {
  let src = fs.readFileSync(file, 'utf8')
  if (!src.includes("@/generated/") || !src.includes('-body.mdx')) continue

  const importRe =
    /^import\s+(\w+)\s+from\s+'@\/generated\/([^']+-body\.mdx)'\s*$/gm
  const imports = [...src.matchAll(importRe)]
  if (imports.length === 0) continue

  // plugins/page.tsx and similar may import multiple — handle all
  const replacements = []
  for (const m of imports) {
    const [, name, bodyFile] = m
    const route = routeForBodyFile(bodyFile)
    if (!route) {
      console.warn('skip (no route map):', bodyFile, 'in', path.relative(websiteRoot, file))
      continue
    }
    replacements.push({ name, bodyFile, route, full: m[0] })
  }
  if (allocationsEmpty(replacements)) continue

  // Remove MDX imports
  for (const r of replacements) {
    src = src.replace(r.full + '\n', '')
    src = src.replace(r.full, '')
  }

  if (!src.includes('AgentMarkdownDocBody')) {
    // Insert import after last remaining import
    const lines = src.split('\n')
    let lastImport = -1
    for (let i = 0; i < lines.length; i++) {
      if (/^import\s/.test(lines[i])) lastImport = i
    }
    const importLine = `import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'`
    if (lastImport >= 0) {
      lines.splice(lastImport + 1, 0, importLine)
      src = lines.join('\n')
    } else {
      src = importLine + '\n' + src
    }
  }

  // Replace <FooBody /> and <FooBody></FooBody> and {FooBody} usages
  for (const r of replacements) {
    const component = `<AgentMarkdownDocBody path="${r.route}" />`
    // <Name /> or <Name className=... /> — keep simple: self-closing and with DocProse wrapper cases
    src = src.replace(new RegExp(`<${r.name}\\s*/>`, 'g'), component)
    src = src.replace(
      new RegExp(`<${r.name}\\s*>(\\s*)<\\/${r.name}>`, 'g'),
      component,
    )
    // Wrapped: <DocProse...><Name /></DocProse> → AgentMarkdownDocBody has DocProse inside
    src = src.replace(
      new RegExp(
        `<DocProse([^>]*)>\\s*<AgentMarkdownDocBody path="${r.route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" />\\s*<\\/DocProse>`,
        'g',
      ),
      `<AgentMarkdownDocBody path="${r.route}"$1 />`,
    )
  }

  // Fix className on AgentMarkdownDocBody when we pulled DocProse attrs
  // e.g. <AgentMarkdownDocBody path="..." className="flex-auto" />
  src = src.replace(
    /<AgentMarkdownDocBody path="([^"]+)"(\s+className="[^"]*")?\s*\/>/g,
    (all, p, cls) =>
      `<AgentMarkdownDocBody path="${p}"${cls ?? ''} />`,
  )

  fs.writeFileSync(file, src)
  changed++
  console.log('migrated', path.relative(websiteRoot, file), '→', replacements.map((r) => r.route).join(', '))
}

function allocationsEmpty(a) {
  return a.length === 0
}

console.log(`done: ${changed} pages`)
