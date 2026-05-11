/**
 * Copies the canonical slide deck from docs/ into src/generated/ for /vision/slide-deck.
 *
 * Source: docs/presentations/clawql-slides.md → src/generated/clawql-slides-body.mdx
 *
 * Run from website/: node scripts/sync-clawql-slides-doc.mjs
 *
 * Docker (`docker build` with context `./website`): if `docs/presentations/` is missing
 * but `src/generated/clawql-slides-body.mdx` exists, exit 0 and keep the committed file.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')
const dst = path.join(dstDir, 'clawql-slides-body.mdx')
const srcRelative = path.join('docs', 'presentations', 'clawql-slides.md')

function findRepoRootWithDocsPresentations() {
  let dir = websiteRoot
  for (let i = 0; i < 10; i++) {
    const presentationsDir = path.join(dir, 'docs', 'presentations')
    if (fs.existsSync(presentationsDir)) {
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

const repoRoot = findRepoRootWithDocsPresentations()
const src = repoRoot ? path.join(repoRoot, srcRelative) : null

if (!src || !fs.existsSync(src)) {
  if (fs.existsSync(dst)) {
    console.warn(
      'sync-clawql-slides-doc: docs/presentations/clawql-slides.md not found; keeping existing src/generated/clawql-slides-body.mdx (typical for Docker context ./website)',
    )
    process.exit(0)
  }
  console.error(
    'sync-clawql-slides-doc: missing source docs/presentations/clawql-slides.md and no generated MDX at',
    dst,
  )
  process.exit(1)
}

fs.copyFileSync(src, dst)
execSync('npx prettier --write src/generated/clawql-slides-body.mdx', {
  cwd: websiteRoot,
  stdio: 'inherit',
})
