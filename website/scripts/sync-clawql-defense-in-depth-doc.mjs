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

import { prepareMdxBody } from './lib/rewrite-doc-links.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')
const dst = path.join(dstDir, 'clawql-defense-in-depth-body.mdx')
const srcRelative = path.join(
  'docs',
  'security',
  'clawql-defense-in-depth-security-guide.md',
)

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
  prepareMdxBody(fs.readFileSync(src, 'utf8'), srcRelative.replace(/\\/g, '/')),
  'utf8',
)

try {
  execSync('npx prettier --write src/generated/clawql-defense-in-depth-body.mdx', {
    cwd: websiteRoot,
    stdio: 'inherit',
  })
} catch {
  console.warn(
    'sync-clawql-defense-in-depth-doc: prettier unavailable; wrote unformatted MDX',
  )
}
