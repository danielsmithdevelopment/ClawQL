/**
 * Copies the canonical ClawQL Modularization vision doc from docs/ into an
 * MDX fragment under src/generated/ so /vision/modularization can import
 * a single source of truth without hand-duplicating long Markdown.
 *
 * Run from website/: node scripts/sync-clawql-modularization-doc.mjs
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const src = path.join(repoRoot, 'docs/vision/clawql-modularization.md')
const dstDir = path.join(__dirname, '../src/generated')
const dst = path.join(dstDir, 'clawql-modularization-body.mdx')

fs.mkdirSync(dstDir, { recursive: true })
if (!fs.existsSync(src)) {
  console.error(`sync-clawql-modularization-doc: missing source ${src}`)
  process.exit(1)
}
fs.copyFileSync(src, dst)
const websiteRoot = path.join(__dirname, '..')
execSync('npx prettier --write src/generated/clawql-modularization-body.mdx', {
  cwd: websiteRoot,
  stdio: 'inherit',
})
