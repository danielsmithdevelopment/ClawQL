/**
 * Copies the Zero-Trust Agentic Fabric architecture doc into an MDX fragment
 * for /architecture/agentic-fabric.
 *
 * Source: docs/architecture/zero-trust-agentic-fabric.md
 *   → src/generated/zero-trust-agentic-fabric-body.mdx
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { appendPassthroughWrapper } from './lib/rewrite-doc-links.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')
const dst = path.join(dstDir, 'zero-trust-agentic-fabric-body.mdx')
const srcRelative = path.join('docs', 'architecture', 'zero-trust-agentic-fabric.md')

const GH_MAIN = 'https://github.com/danielsmithdevelopment/ClawQL/blob/main'

function findRepoRootWithDocs() {
  let dir = websiteRoot
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'docs'))) return dir
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
        .replaceAll(
          '](../vision/clawql-vision-roadmap.md)',
          '](/vision/roadmap)',
        )
        .replaceAll(
          '](../inference/clawql-inference.md)',
          '](/inference/clawql-inference)',
        )
        .replaceAll('](../../docs/', `](${GH_MAIN}/docs/`)
        .replaceAll('](../docs/', `](${GH_MAIN}/docs/`),
    ),
  )
}

fs.mkdirSync(dstDir, { recursive: true })

const repoRoot = findRepoRootWithDocs()
const src = repoRoot ? path.join(repoRoot, srcRelative) : null

if (!src || !fs.existsSync(src)) {
  if (fs.existsSync(dst)) {
    console.warn(
      'sync-zero-trust-agentic-fabric-doc: source not found; keeping existing generated MDX',
    )
    process.exit(0)
  }
  console.error(
    'sync-zero-trust-agentic-fabric-doc: missing source and no generated MDX at',
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
  execSync('npx prettier --write src/generated/zero-trust-agentic-fabric-body.mdx', {
    cwd: websiteRoot,
    stdio: 'inherit',
  })
} catch {
  console.warn(
    'sync-zero-trust-agentic-fabric-doc: prettier unavailable; left unformatted MDX',
  )
}
console.log('sync-zero-trust-agentic-fabric-doc: wrote', path.relative(websiteRoot, dst))
