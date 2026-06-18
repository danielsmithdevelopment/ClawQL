/**
 * Copies the Contributor Technical Specification from docs/ into an MDX fragment
 * for /contributing/technical-specification.
 *
 * Source: docs/contributing/clawql-contributor-technical-specification.md
 *   → src/generated/clawql-contributor-technical-spec-body.mdx
 *
 * Run from website/: node scripts/sync-clawql-contributor-technical-spec-doc.mjs
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')
const dst = path.join(dstDir, 'clawql-contributor-technical-spec-body.mdx')
const srcRelative = path.join(
  'docs',
  'contributing',
  'clawql-contributor-technical-specification.md',
)

const GH_MAIN = 'https://github.com/danielsmithdevelopment/ClawQL/blob/main'

function findRepoRootWithDocs() {
  let dir = websiteRoot
  for (let i = 0; i < 10; i++) {
    const docsDir = path.join(dir, 'docs')
    if (fs.existsSync(docsDir)) {
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

function escapeLessThanBeforeDigit(body) {
  return body.replace(/<(?=\d)/g, '&lt;')
}

function escapeMdxCurlyOutsideFences(body) {
  const lines = body.split('\n')
  let inFence = false
  return lines
    .map((line) => {
      const fence = line.match(/^(`{3,}|~{3,})(.*)$/)
      if (fence) {
        if (!inFence) inFence = true
        else if (!fence[2].trim()) inFence = false
        return line
      }
      if (inFence) return line
      return line
        .replace(/\\/g, '\\\\')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}')
    })
    .join('\n')
}

function rewriteLinksForSite(body) {
  return escapeMdxCurlyOutsideFences(
    escapeLessThanBeforeDigit(
      body
        .replaceAll(
          '](../vision/clawql-vision-roadmap.md)',
          '](/vision/roadmap)',
        )
        .replaceAll(
          '](../deployment/clawql-deployment-operations-guide.md)',
          '](/deployment/operations-guide)',
        )
        .replaceAll('](../../docs/', `](${GH_MAIN}/docs/`)
        .replaceAll('](../docs/', `](${GH_MAIN}/docs/`),
    ),
  )
}

fs.mkdirSync(dstDir, { recursive: true })

const repoRoot = findRepoRootWithDocs()
const src = repoRoot ? path.join(repoRoot, srcRelative) : null

if (!src || !fs.existsSync(src)) {
  if (fs.existsSync(dst)) {
    console.warn(
      'sync-clawql-contributor-technical-spec-doc: source not found; keeping existing generated MDX (typical for Docker context ./website)',
    )
    process.exit(0)
  }
  console.error(
    'sync-clawql-contributor-technical-spec-doc: missing source and no generated MDX at',
    dst,
  )
  process.exit(1)
}

const raw = fs.readFileSync(src, 'utf8')
fs.writeFileSync(dst, rewriteLinksForSite(raw), 'utf8')
execSync(
  'npx prettier --write src/generated/clawql-contributor-technical-spec-body.mdx',
  {
    cwd: websiteRoot,
    stdio: 'inherit',
  },
)
