/**
 * Copies the DAOS coordination layer spec into src/generated/ for
 * /ouroboros/specification.
 *
 * Source: docs/ouroboros/daos-coordination-layer-specification.md
 *   → src/generated/daos-coordination-layer-spec-body.mdx
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { appendPassthroughWrapper } from './lib/rewrite-doc-links.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')
const dst = path.join(dstDir, 'daos-coordination-layer-spec-body.mdx')
const srcRelative = path.join(
  'docs',
  'ouroboros',
  'daos-coordination-layer-specification.md',
)

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

function rewriteDaosLinks(body) {
  return body
    .replaceAll(
      '](./daos-unified-architecture-specification-v2.7.md)',
      '](/ouroboros/daos)',
    )
    .replaceAll(
      '](./daos-coordination-layer-specification.md)',
      '](/ouroboros/specification)',
    )
    .replaceAll('](./daos-build-plan-v2.7.1.md)', '](/ouroboros/build-plan)')
    .replaceAll('](./clawql-ouroboros.md)', '](/ouroboros)')
    .replaceAll(
      '](../vision/clawql-master-enablement-guide.md)',
      '](/architecture)',
    )
    .replaceAll('](../deployment/helm.md)', '](/helm')
    .replaceAll(
      '](../design/modularization-implementation-status.md)',
      `](${GH_MAIN}/docs/design/modularization-implementation-status.md)`,
    )
    .replaceAll('](../../docs/', `](${GH_MAIN}/docs/`)
    .replaceAll('](../docs/', `](${GH_MAIN}/docs/`)
}

function rewriteLinksForSite(body) {
  return escapeMdxCurlyOutsideFences(
    escapeLessThanBeforeDigit(rewriteDaosLinks(body)),
  )
}

fs.mkdirSync(dstDir, { recursive: true })

const repoRoot = findRepoRootWithDocs()
const src = repoRoot ? path.join(repoRoot, srcRelative) : null

if (!src || !fs.existsSync(src)) {
  if (fs.existsSync(dst)) {
    console.warn(
      'sync-daos-coordination-layer-spec-doc: source not found; keeping existing generated MDX',
    )
    process.exit(0)
  }
  console.error(
    'sync-daos-coordination-layer-spec-doc: missing source and no generated MDX at',
    dst,
  )
  process.exit(1)
}

fs.writeFileSync(
  dst,
  appendPassthroughWrapper(rewriteLinksForSite(fs.readFileSync(src, 'utf8'))),
  'utf8',
)
execSync('npx prettier --write src/generated/daos-coordination-layer-spec-body.mdx', {
  cwd: websiteRoot,
  stdio: 'inherit',
})
