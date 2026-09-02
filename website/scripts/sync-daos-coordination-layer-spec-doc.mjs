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

import { prepareMdxBody } from './lib/rewrite-doc-links.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')
const dst = path.join(dstDir, 'daos-coordination-layer-spec-body.mdx')
const srcRelative = path.join(
  'docs',
  'ouroboros',
  'daos-coordination-layer-specification.md',
)

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
  prepareMdxBody(fs.readFileSync(src, 'utf8'), srcRelative.replace(/\\/g, '/')),
  'utf8',
)
try {
  execSync('npx prettier --write src/generated/daos-coordination-layer-spec-body.mdx', {
    cwd: websiteRoot,
    stdio: 'inherit',
  })
} catch {
  console.warn(
    'sync-daos-coordination-layer-spec-doc: prettier unavailable; wrote unformatted MDX',
  )
}
