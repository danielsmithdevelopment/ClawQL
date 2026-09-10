/**
 * Copies docs/streams/clawql-tee-airgap-audit.md into MDX for
 * /streams/clawql-tee-airgap-audit.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { prepareMdxBody } from './lib/rewrite-doc-links.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')
const dst = path.join(dstDir, 'clawql-tee-airgap-audit-body.mdx')
const srcRelative = path.join('docs', 'streams', 'clawql-tee-airgap-audit.md')

function findRepoRootWithDocs() {
  let dir = websiteRoot
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'docs'))) {
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
      'sync-clawql-tee-airgap-audit-doc: source not found; keeping existing generated MDX',
    )
    process.exit(0)
  }
  console.error(
    'sync-clawql-tee-airgap-audit-doc: missing source and no generated MDX at',
    dst,
  )
  process.exit(1)
}

fs.writeFileSync(
  dst,
  prepareMdxBody(fs.readFileSync(src, 'utf8'), srcRelative),
  'utf8',
)
try {
  execSync(
    'npx prettier --write src/generated/clawql-tee-airgap-audit-body.mdx',
    {
      cwd: websiteRoot,
      stdio: 'inherit',
    },
  )
} catch {
  console.warn(
    'sync-clawql-tee-airgap-audit-doc: prettier unavailable; wrote unformatted MDX',
  )
}
