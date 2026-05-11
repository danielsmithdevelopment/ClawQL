/**
 * Copies the comprehensive defense-in-depth security guide into src/generated/ for
 * /security/defense-in-depth. Rewrites relative repo links to github.com so they
 * work from the docs site origin.
 *
 * Source: docs/security/clawql-comprehensive-defense-in-depth-mcp-k3s-may-2026.md
 *   → src/generated/clawql-defense-in-depth-body.mdx
 *
 * Run from website/: node scripts/sync-clawql-defense-in-depth-doc.mjs
 *
 * Docker (`docker build` with context `./website`): if `docs/security/` is missing
 * but `src/generated/clawql-defense-in-depth-body.mdx` exists, exit 0 and keep
 * the committed file.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')
const dst = path.join(dstDir, 'clawql-defense-in-depth-body.mdx')
const srcRelative = path.join(
  'docs',
  'security',
  'clawql-comprehensive-defense-in-depth-mcp-k3s-may-2026.md',
)

const GH_MAIN = 'https://github.com/danielsmithdevelopment/ClawQL/blob/main'

function findRepoRootWithDocsSecurity() {
  let dir = websiteRoot
  for (let i = 0; i < 10; i++) {
    const securityDir = path.join(dir, 'docs', 'security')
    if (fs.existsSync(securityDir)) {
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

/** Map relative Markdown links to absolute GitHub blob URLs for site rendering. */
function rewriteLinksForSite(body) {
  return body
    .replaceAll('](../../charts/', `](${GH_MAIN}/charts/`)
    .replaceAll('](../../docs/', `](${GH_MAIN}/docs/`)
    .replaceAll('](../../docker/', `](${GH_MAIN}/docker/`)
    .replaceAll('](../../AGENTS.md)', `](${GH_MAIN}/AGENTS.md)`)
    .replaceAll(
      '](clawql-security-defense-in-depth.md)',
      `](${GH_MAIN}/docs/security/clawql-security-defense-in-depth.md)`,
    )
    .replaceAll(
      '](clawql-security-defense-deliverables.md)',
      `](${GH_MAIN}/docs/security/clawql-security-defense-deliverables.md)`,
    )
    .replaceAll(
      '](runtime-class-containment.md)',
      `](${GH_MAIN}/docs/security/runtime-class-containment.md)`,
    )
    .replaceAll('](mcp-proxy-jwt-atr.md)', `](${GH_MAIN}/docs/security/mcp-proxy-jwt-atr.md)`)
}

fs.mkdirSync(dstDir, { recursive: true })

const repoRoot = findRepoRootWithDocsSecurity()
const src = repoRoot ? path.join(repoRoot, srcRelative) : null

if (!src || !fs.existsSync(src)) {
  if (fs.existsSync(dst)) {
    console.warn(
      'sync-clawql-defense-in-depth-doc: docs/security/clawql-comprehensive-defense-in-depth-mcp-k3s-may-2026.md not found; keeping existing src/generated/clawql-defense-in-depth-body.mdx (typical for Docker context ./website)',
    )
    process.exit(0)
  }
  console.error(
    'sync-clawql-defense-in-depth-doc: missing source and no generated MDX at',
    dst,
  )
  process.exit(1)
}

const raw = fs.readFileSync(src, 'utf8')
fs.writeFileSync(dst, rewriteLinksForSite(raw), 'utf8')

execSync('npx prettier --write src/generated/clawql-defense-in-depth-body.mdx', {
  cwd: websiteRoot,
  stdio: 'inherit',
})
