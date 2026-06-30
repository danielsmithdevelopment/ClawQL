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

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')
const dst = path.join(dstDir, 'clawql-idp-platform-body.mdx')
const srcRelative = path.join('docs', 'vision', 'clawql-idp-platform.md')

const GH_MAIN = 'https://github.com/danielsmithdevelopment/ClawQL/blob/main'

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
          '](../providers/idp-pipeline.md)',
          '](/learn/document-pipeline)',
        )
        .replaceAll('](../providers/', `](${GH_MAIN}/docs/providers/`)
        .replaceAll('](../openclaw/', `](${GH_MAIN}/docs/openclaw/`)
        .replaceAll('](../roadmap/', `](${GH_MAIN}/docs/roadmap/`)
        .replaceAll('](../dashboard/', `](${GH_MAIN}/docs/dashboard/`)
        .replaceAll(
          '](../deployment/clawql-deployment-operations-guide.md)',
          '](/deployment/operations-guide)',
        )
        .replaceAll('](../deployment/', `](${GH_MAIN}/docs/deployment/`)
        .replaceAll(
          '](./clawql-master-enablement-guide.md)',
          '](/vision/technical-enablement)',
        )
        .replaceAll('](./clawql-vision-roadmap.md)', '](/vision/roadmap)')
        .replaceAll('](../../charts/', `](${GH_MAIN}/charts/`),
    ),
  )
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
fs.writeFileSync(dst, rewriteLinksForSite(raw), 'utf8')

execSync('npx prettier --write src/generated/clawql-idp-platform-body.mdx', {
  cwd: websiteRoot,
  stdio: 'inherit',
})
