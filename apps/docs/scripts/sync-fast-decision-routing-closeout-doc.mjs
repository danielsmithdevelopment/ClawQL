/**
 * Copies docs/specs/classifier/fast-decision-routing-closeout-v0.4.md into an
 * MDX fragment for /specs/classifier/fast-decision-routing-closeout.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { prepareMdxBody } from './lib/rewrite-doc-links.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')
const dst = path.join(dstDir, 'fast-decision-routing-closeout-body.mdx')
const srcRelative = path.join(
  'docs',
  'specs',
  'classifier',
  'fast-decision-routing-closeout-v0.4.md',
)

function findRepoRootWithDocs() {
  let dir = websiteRoot
  for (let i = 0; i < 10; i++) {
    // Prefer the monorepo root (docs/specs + packages), not apps/docs itself.
    const candidate = path.join(dir, srcRelative)
    if (fs.existsSync(candidate)) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/** Strip leading YAML frontmatter — MDX treats `---` poorly as page body. */
function stripLeadingFrontmatter(raw) {
  if (!raw.startsWith('---\n')) return raw
  const end = raw.indexOf('\n---\n', 4)
  if (end === -1) return raw
  return raw.slice(end + '\n---\n'.length).replace(/^\n+/, '')
}

fs.mkdirSync(dstDir, { recursive: true })

const repoRoot = findRepoRootWithDocs()
const src = repoRoot ? path.join(repoRoot, srcRelative) : null

if (!src || !fs.existsSync(src)) {
  if (fs.existsSync(dst)) {
    console.warn(
      'sync-fast-decision-routing-closeout-doc: source not found; keeping existing generated MDX',
    )
    process.exit(0)
  }
  console.error(
    'sync-fast-decision-routing-closeout-doc: missing source and no generated MDX at',
    dst,
  )
  process.exit(1)
}

fs.writeFileSync(
  dst,
  prepareMdxBody(stripLeadingFrontmatter(fs.readFileSync(src, 'utf8')), srcRelative),
  'utf8',
)
try {
  execSync(
    'npx prettier --write src/generated/fast-decision-routing-closeout-body.mdx',
    {
      cwd: websiteRoot,
      stdio: 'inherit',
    },
  )
} catch {
  console.warn(
    'sync-fast-decision-routing-closeout-doc: prettier unavailable; wrote unformatted MDX',
  )
}

console.log(
  'sync-fast-decision-routing-closeout-doc: wrote',
  path.relative(websiteRoot, dst),
)
