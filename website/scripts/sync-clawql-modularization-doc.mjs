/**
 * Copies the v2.1 modularization doc from docs/ into an MDX fragment
 * for /vision/modularization. Overall product vision canon is
 * docs/vision/clawql-master-enablement-guide.md (/vision/technical-enablement).
 *
 * Source: docs/vision/clawql-modularization-v2.md → src/generated/clawql-modularization-body.mdx
 * (v1.9 package matrix: docs/vision/clawql-modularization.md — GitHub only.)
 *
 * Run from website/: node scripts/sync-clawql-modularization-doc.mjs
 *
 * Docker (`docker build` with context `./website`): repo `docs/` is not in the
 * build context. We walk up from `website/` until `docs/vision/` is found; if never
 * found but `src/generated/clawql-modularization-body.mdx` exists, exit 0 and keep
 * the committed generated file.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')
const dst = path.join(dstDir, 'clawql-modularization-body.mdx')
const srcRelative = path.join('docs', 'vision', 'clawql-modularization-v2.md')

/** Walk parents from `website/` until docs/vision exists in repo. */
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
      'sync-clawql-modularization-doc: docs/vision/clawql-modularization-v2.md not found; keeping existing src/generated/clawql-modularization-body.mdx (typical for Docker context ./website)',
    )
    process.exit(0)
  }
  console.error(
    'sync-clawql-modularization-doc: missing source docs/vision/clawql-modularization-v2.md and no generated MDX at',
    dst,
  )
  process.exit(1)
}

let body = fs.readFileSync(src, 'utf8')
// GitHub renders images relative to docs/vision/*.md; the site serves them from
// /public. Rewrite the repo-relative path used in the canonical doc.
body = body.replaceAll(
  '../../website/public/vision/clawql-dependency-stack.png',
  '/vision/clawql-dependency-stack.png',
)
body = body.replaceAll(
  '](./clawql-hybrid-decentralized-github-alternative.md)',
  '](/vision/immutable-releases)',
)
fs.writeFileSync(dst, body)
execSync('npx prettier --write src/generated/clawql-modularization-body.mdx', {
  cwd: websiteRoot,
  stdio: 'inherit',
})
