/**
 * Copies session IFC product reference into src/generated/ for
 * /security/session-ifc.
 *
 * Source: docs/security/session-information-flow-control.md
 *   → src/generated/session-ifc-body.mdx
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { appendPassthroughWrapper } from './lib/rewrite-doc-links.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')
const dst = path.join(dstDir, 'session-ifc-body.mdx')
const srcRelative = path.join(
  'docs',
  'security',
  'session-information-flow-control.md',
)

const GH_MAIN = 'https://github.com/danielsmithdevelopment/ClawQL/blob/main'

function findRepoRootWithDocsSecurity() {
  let dir = websiteRoot
  for (let i = 0; i < 10; i++) {
    const securityDir = path.join(dir, 'docs', 'security')
    if (fs.existsSync(securityDir)) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      break
    }
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
        .replaceAll(
          '](../adr/0015-program-mode-alongside-search-execute.md)',
          `](${GH_MAIN}/docs/adr/0015-program-mode-alongside-search-execute.md)`,
        )
        .replaceAll(
          '](../benchmarks/security-suite/multi-attack-injection/NATIVE-TOOL-GOVERNANCE.md)',
          `](${GH_MAIN}/docs/benchmarks/security-suite/multi-attack-injection/NATIVE-TOOL-GOVERNANCE.md)`,
        )
        .replaceAll(
          '](mcp-proxy-jwt-atr.md)',
          '](/learn/panguard-mcp-enforcement)',
        )
        .replaceAll('](README.md)', '](/security)')
        .replaceAll(
          '](https://docs.clawql.com/learn/panguard-mcp-enforcement)',
          '](/learn/panguard-mcp-enforcement)',
        )
        .replaceAll('](../../', `](${GH_MAIN}/`),
    ),
  )
}

fs.mkdirSync(dstDir, { recursive: true })

const repoRoot = findRepoRootWithDocsSecurity()
const src = repoRoot ? path.join(repoRoot, srcRelative) : null

if (!src || !fs.existsSync(src)) {
  if (fs.existsSync(dst)) {
    console.warn(
      'sync-session-ifc-doc: source not found; keeping existing generated MDX',
    )
    process.exit(0)
  }
  console.error(
    'sync-session-ifc-doc: missing source and no generated MDX at',
    dst,
  )
  process.exit(1)
}

fs.writeFileSync(
  dst,
  appendPassthroughWrapper(rewriteLinksForSite(fs.readFileSync(src, 'utf8'))),
  'utf8',
)

try {
  execSync('npx prettier --write src/generated/session-ifc-body.mdx', {
    cwd: websiteRoot,
    stdio: 'inherit',
  })
} catch {
  console.warn(
    'sync-session-ifc-doc: prettier unavailable; left generated MDX unformatted',
  )
}

console.log('sync-session-ifc-doc: wrote', path.relative(websiteRoot, dst))
