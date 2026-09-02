/**
 * Copies the DAOS build plan v2.7.1 into src/generated/ for /ouroboros/build-plan.
 *
 * Source: docs/ouroboros/daos-build-plan-v2.7.1.md
 *   → src/generated/daos-build-plan-body.mdx
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { prepareMdxBody } from './lib/rewrite-doc-links.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')
const dst = path.join(dstDir, 'daos-build-plan-body.mdx')
const srcRelative = path.join('docs', 'ouroboros', 'daos-build-plan-v2.7.1.md')

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
      'sync-daos-build-plan-doc: source not found; keeping existing generated MDX',
    )
    process.exit(0)
  }
  console.error(
    'sync-daos-build-plan-doc: missing source and no generated MDX at',
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
  execSync('npx prettier --write src/generated/daos-build-plan-body.mdx', {
    cwd: websiteRoot,
    stdio: 'inherit',
  })
} catch {
  console.warn(
    'sync-daos-build-plan-doc: prettier unavailable; wrote unformatted MDX',
  )
}
