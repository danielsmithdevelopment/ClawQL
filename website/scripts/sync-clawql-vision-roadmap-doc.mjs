/**
 * Copies the public Vision & Roadmap doc from docs/ into an MDX fragment
 * for /vision/roadmap.
 *
 * Source: docs/vision/clawql-vision-roadmap.md
 *   → src/generated/clawql-vision-roadmap-body.mdx
 *
 * Run from website/: node scripts/sync-clawql-vision-roadmap-doc.mjs
 *
 * Docker (`docker build` with context `./website`): if `docs/vision/` is missing
 * but `src/generated/clawql-vision-roadmap-body.mdx` exists, exit 0 and keep
 * the committed generated file.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')
const dst = path.join(dstDir, 'clawql-vision-roadmap-body.mdx')
const srcRelative = path.join('docs', 'vision', 'clawql-vision-roadmap.md')

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
      'sync-clawql-vision-roadmap-doc: docs/vision/clawql-vision-roadmap.md not found; keeping existing src/generated/clawql-vision-roadmap-body.mdx (typical for Docker context ./website)',
    )
    process.exit(0)
  }
  console.error(
    'sync-clawql-vision-roadmap-doc: missing source and no generated MDX at',
    dst,
  )
  process.exit(1)
}

const body = fs.readFileSync(src, 'utf8')
  .replaceAll(
    '](../contributing/clawql-contributor-technical-specification.md)',
    '](/contributing/technical-specification)',
  )
  .replaceAll(
    '](../deployment/clawql-deployment-operations-guide.md)',
    '](/deployment/operations-guide)',
  )
  .replaceAll('](../design/clawql-plugin-model.md)', '](/reference/plugins)')
  .replaceAll(
    '](../design/modularization-implementation-status.md)',
    `](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/design/modularization-implementation-status.md)`,
  )
fs.writeFileSync(dst, body)
execSync('npx prettier --write src/generated/clawql-vision-roadmap-body.mdx', {
  cwd: websiteRoot,
  stdio: 'inherit',
})
