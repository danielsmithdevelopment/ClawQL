/**
 * Copies the ecosystem vision doc into src/generated/ for /vision/roadmap.
 *
 * Source: docs/clawql-ecosystem.md → src/generated/clawql-ecosystem-body.mdx
 *
 * Run from website/: node scripts/sync-clawql-ecosystem-doc.mjs
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { prepareMdxBody } from './lib/rewrite-doc-links.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')
const dst = path.join(dstDir, 'clawql-ecosystem-body.mdx')
const srcRelative = path.join('docs', 'clawql-ecosystem.md')

function findRepoRootWithDocs() {
  let dir = websiteRoot
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'docs', 'clawql-ecosystem.md'))) {
      return dir
    }
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
      'sync-clawql-ecosystem-doc: docs/clawql-ecosystem.md not found; keeping existing generated MDX',
    )
    process.exit(0)
  }
  console.error('sync-clawql-ecosystem-doc: missing source and no generated MDX')
  process.exit(1)
}

const raw = fs.readFileSync(src, 'utf8')
fs.writeFileSync(dst, prepareMdxBody(raw, srcRelative), 'utf8')

execSync('npx prettier --write src/generated/clawql-ecosystem-body.mdx', {
  cwd: websiteRoot,
  stdio: 'inherit',
})
