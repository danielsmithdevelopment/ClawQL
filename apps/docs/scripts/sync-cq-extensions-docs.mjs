/**
 * Sync docs/specs/cq-extensions/* into MDX bodies for /specs/cq-extensions/*.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { prepareMdxBody } from './lib/rewrite-doc-links.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')

const SPECS = [
  { src: 'docs/specs/cq-extensions/README.md', body: 'cq-extensions-index-body.mdx' },
  { src: 'docs/specs/cq-extensions/cqe.md', body: 'cq-extensions-cqe-body.mdx' },
  { src: 'docs/specs/cq-extensions/cqm.md', body: 'cq-extensions-cqm-body.mdx' },
  { src: 'docs/specs/cq-extensions/cqk.md', body: 'cq-extensions-cqk-body.mdx' },
  { src: 'docs/specs/cq-extensions/cqw.md', body: 'cq-extensions-cqw-body.mdx' },
]

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

for (const spec of SPECS) {
  const dst = path.join(dstDir, spec.body)
  const src = repoRoot ? path.join(repoRoot, spec.src) : null
  if (!src || !fs.existsSync(src)) {
    if (fs.existsSync(dst)) {
      console.warn(`sync-cq-extensions-docs: missing ${spec.src}; keeping ${spec.body}`)
      continue
    }
    console.error(`sync-cq-extensions-docs: missing ${spec.src}`)
    process.exit(1)
  }
  fs.writeFileSync(
    dst,
    prepareMdxBody(fs.readFileSync(src, 'utf8'), spec.src.replace(/\\/g, '/')),
    'utf8',
  )
  try {
    execSync(`npx prettier --write src/generated/${spec.body}`, {
      cwd: websiteRoot,
      stdio: 'inherit',
    })
  } catch {
    console.warn(`sync-cq-extensions-docs: prettier unavailable for ${spec.body}`)
  }
}
