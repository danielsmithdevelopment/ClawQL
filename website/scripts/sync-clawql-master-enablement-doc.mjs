/**
 * Copies the Master Enablement guide into src/generated/ for
 * /architecture. Rewrites relative repo links to github.com;
 * escapes MDX-problematic `{`/`}` and `<digit` patterns outside fenced blocks.
 *
 * Source: docs/vision/clawql-master-enablement-guide.md
 *   → src/generated/clawql-master-enablement-body.mdx
 *
 * Run from website/: node scripts/sync-clawql-master-enablement-doc.mjs
 *
 * Docker (`docker build` with context `./website`): if `docs/vision/` is missing
 * but `src/generated/clawql-master-enablement-body.mdx` exists, exit 0 and keep
 * the committed file.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { prepareMdxBody } from './lib/rewrite-doc-links.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')
const dst = path.join(dstDir, 'clawql-master-enablement-body.mdx')
const srcRelative = path.join(
  'docs',
  'vision',
  'clawql-master-enablement-guide.md',
)

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

/** Avoid MDX interpreting `<50ms`-style text as JSX tags. */
function escapeLessThanBeforeDigit(body) {
  return body.replace(/<(?=\d)/g, '&lt;')
}

/** Escape `{` / `}` outside fenced code blocks so inline JSON examples compile as MDX. */
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

/** Map relative Markdown links to absolute GitHub blob URLs for site rendering. */
function rewriteLinksForSite(body) {
  return escapeMdxCurlyOutsideFences(
    escapeLessThanBeforeDigit(
      body
        .replaceAll('](./clawql-idp-platform.md)', '](/vision/idp-platform)')
        .replaceAll('](./clawql-idp-stack.md)', '](/vision/idp-platform)')
        .replaceAll('](./clawql-vision-roadmap.md)', '](/vision/roadmap)')
        .replaceAll(
          '](./clawql-modularization-v2.md)',
          '](/architecture)',
        )
        .replaceAll(
          '](./clawql-hybrid-decentralized-github-alternative.md)',
          '](/vision/immutable-releases)',
        )
        .replaceAll(
          '](../design/clawql-plugin-model.md)',
          '](/reference/plugins)',
        )
        .replaceAll(
          '](../reference/clawql-plugin-registry.md)',
          '](/reference/plugins#plugin-registry)',
        )
        .replaceAll(
          '](../design/modularization-implementation-status.md)',
          `](${GH_MAIN}/docs/design/modularization-implementation-status.md)`,
        )
        .replaceAll(
          '](../contributing/clawql-contributor-technical-specification.md)',
          '](/contributing/technical-specification)',
        )
        .replaceAll(
          '](../deployment/clawql-deployment-operations-guide.md)',
          '](/deployment/operations-guide)',
        )
        .replaceAll(
          '](../security/clawql-defense-in-depth-security-guide.md)',
          '](/security/defense-in-depth)',
        )
        .replaceAll(
          '](../security/security-best-practices-series/README.md)',
          '](/security/best-practices)',
        )
        .replaceAll(
          '](../architecture/clawql-token-efficiency.md)',
          '](/architecture/token-efficiency)',
        )
        .replaceAll(
          '](../ouroboros/daos-unified-architecture-specification-v2.7.md)',
          '](/ouroboros/daos)',
        )
        .replaceAll(
          '](../ouroboros/daos-coordination-layer-specification.md)',
          '](/ouroboros/specification)',
        )
        .replaceAll(
          '](../ouroboros/daos-build-plan-v2.7.1.md)',
          '](/ouroboros/build-plan)',
        )
        .replaceAll(
          '](../ouroboros/decentralized-agent-operating-system-specification.md)',
          '](/ouroboros/specification)',
        )
        .replaceAll('](../../charts/', `](${GH_MAIN}/charts/`)
        .replaceAll('](../../docs/', `](${GH_MAIN}/docs/`)
        .replaceAll('](../docs/', `](${GH_MAIN}/docs/`)
        .replaceAll('](../../docker/', `](${GH_MAIN}/docker/`)
        .replaceAll('](../../AGENTS.md)', `](${GH_MAIN}/AGENTS.md)`),
    ),
  )
}

fs.mkdirSync(dstDir, { recursive: true })

const repoRoot = findRepoRootWithDocsVision()
const src = repoRoot ? path.join(repoRoot, srcRelative) : null

if (!src || !fs.existsSync(src)) {
  if (fs.existsSync(dst)) {
    console.warn(
      'sync-clawql-master-enablement-doc: docs/vision/clawql-master-enablement-guide.md not found; keeping existing src/generated/clawql-master-enablement-body.mdx (typical for Docker context ./website)',
    )
    process.exit(0)
  }
  console.error(
    'sync-clawql-master-enablement-doc: missing source and no generated MDX at',
    dst,
  )
  process.exit(1)
}

const raw = fs.readFileSync(src, 'utf8')
fs.writeFileSync(dst, prepareMdxBody(raw, srcRelative), 'utf8')

execSync('npx prettier --write src/generated/clawql-master-enablement-body.mdx', {
  cwd: websiteRoot,
  stdio: 'inherit',
})
