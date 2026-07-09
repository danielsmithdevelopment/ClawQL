/**
 * Copies the IDP Platform vision doc into src/generated/ for /vision/idp-platform.
 * Rewrites relative repo links for site rendering; escapes MDX-problematic patterns.
 *
 * Source: docs/vision/clawql-idp-platform.md
 *   → src/generated/clawql-idp-platform-body.mdx
 *
 * Run from website/: node scripts/sync-clawql-idp-platform-doc.mjs
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { prepareMdxBody } from './lib/rewrite-doc-links.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')
const dst = path.join(dstDir, 'clawql-idp-platform-body.mdx')
const srcRelative = path.join('docs', 'vision', 'clawql-idp-platform.md')

function findRepoRootWithDocsVision() {
  let dir = websiteRoot
  for (let i = 0; i < 10; i++) {
    const visionDir = path.join(dir, 'docs', 'vision')
    if (fs.existsSync(visionDir)) {
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

fs.mkdirSync(dstDir, { recursive: true })

const repoRoot = findRepoRootWithDocsVision()
const src = repoRoot ? path.join(repoRoot, srcRelative) : null

if (!src || !fs.existsSync(src)) {
  if (fs.existsSync(dst)) {
    console.warn(
      'sync-clawql-idp-platform-doc: docs/vision/clawql-idp-platform.md not found; keeping existing src/generated/clawql-idp-platform-body.mdx',
    )
    process.exit(0)
  }
  console.error(
    'sync-clawql-idp-platform-doc: missing source and no generated MDX at',
    dst,
  )
  process.exit(1)
}

const raw = fs.readFileSync(src, 'utf8')
fs.writeFileSync(dst, prepareMdxBody(raw, srcRelative), 'utf8')

execSync('npx prettier --write src/generated/clawql-idp-platform-body.mdx', {
  cwd: websiteRoot,
  stdio: 'inherit',
})
