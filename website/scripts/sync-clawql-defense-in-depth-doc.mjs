/**
 * Copies the Defense-in-Depth Security Guide into src/generated/ for
 * /security/defense-in-depth.
 *
 * Source: docs/security/clawql-defense-in-depth-security-guide.md
 *   → src/generated/clawql-defense-in-depth-body.mdx
 *
 * Legacy comprehensive doc (archived reference):
 *   docs/security/clawql-comprehensive-defense-in-depth-mcp-k3s-may-2026.md
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
  'clawql-defense-in-depth-security-guide.md',
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
          '](security-best-practices-series/)',
          '](/security/best-practices)',
        )
        .replaceAll(
          '](mcp-proxy-jwt-atr.md)',
          `](${GH_MAIN}/docs/security/mcp-proxy-jwt-atr.md)`,
        )
        .replaceAll('](../../charts/', `](${GH_MAIN}/charts/`)
        .replaceAll('](../../docs/', `](${GH_MAIN}/docs/`)
        .replaceAll('](../../docker/', `](${GH_MAIN}/docker/`)
        .replaceAll('](../../AGENTS.md)', `](${GH_MAIN}/AGENTS.md)`),
    ),
  )
}

fs.mkdirSync(dstDir, { recursive: true })

const repoRoot = findRepoRootWithDocsSecurity()
const src = repoRoot ? path.join(repoRoot, srcRelative) : null

if (!src || !fs.existsSync(src)) {
  if (fs.existsSync(dst)) {
    console.warn(
      'sync-clawql-defense-in-depth-doc: source not found; keeping existing generated MDX',
    )
    process.exit(0)
  }
  console.error(
    'sync-clawql-defense-in-depth-doc: missing source and no generated MDX at',
    dst,
  )
  process.exit(1)
}

fs.writeFileSync(
  dst,
  rewriteLinksForSite(fs.readFileSync(src, 'utf8')),
  'utf8',
)

execSync('npx prettier --write src/generated/clawql-defense-in-depth-body.mdx', {
  cwd: websiteRoot,
  stdio: 'inherit',
})
