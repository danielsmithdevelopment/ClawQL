/**
 * Copies the canonical ClawQL Modularization vision doc from docs/ into an
 * MDX fragment under src/generated/ so /vision/modularization can import
 * a single source of truth without hand-duplicating long Markdown.
 *
 * Run from website/: node scripts/sync-clawql-modularization-doc.mjs
 *
 * Docker (`docker build` with context `./website`): repo `docs/` is not in the
 * build context. We walk up from `website/` until `docs/vision/clawql-modularization.md`
 * appears; if never found but `src/generated/clawql-modularization-body.mdx` exists,
 * exit 0 and keep the committed generated file.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')
const dst = path.join(dstDir, 'clawql-modularization-body.mdx')

/** Walk parents from `website/` until docs/vision/clawql-modularization.md exists. */
function findCanonicalVisionDoc() {
  let dir = websiteRoot
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'docs', 'vision', 'clawql-modularization.md')
    if (fs.existsSync(candidate)) {
      return candidate
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

const src = findCanonicalVisionDoc()
if (!src) {
  if (fs.existsSync(dst)) {
    console.warn(
      'sync-clawql-modularization-doc: canonical docs/vision/clawql-modularization.md not found; keeping existing src/generated/clawql-modularization-body.mdx (typical for Docker context ./website)',
    )
    process.exit(0)
  }
  console.error(
    'sync-clawql-modularization-doc: missing source docs/vision/clawql-modularization.md and no generated MDX at',
    dst,
  )
  process.exit(1)
}

fs.copyFileSync(src, dst)
execSync('npx prettier --write src/generated/clawql-modularization-body.mdx', {
  cwd: websiteRoot,
  stdio: 'inherit',
})
