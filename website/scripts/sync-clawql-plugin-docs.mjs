/**
 * Copies plugin model + plugin registry from docs/ into MDX fragments for
 * /plugins (#plugin-model; registry markdown kept as contributor ground truth).
 *
 * Sources:
 *   docs/design/clawql-plugin-model.md → src/generated/clawql-plugin-model-body.mdx
 *   docs/reference/clawql-plugin-registry.md → src/generated/clawql-plugin-registry-body.mdx
 *
 * Run from website/: node scripts/sync-clawql-plugin-docs.mjs
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { prepareMdxBody } from './lib/rewrite-doc-links.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')

const JOBS = [
  {
    srcRelative: path.join('docs', 'design', 'clawql-plugin-model.md'),
    dst: path.join(dstDir, 'clawql-plugin-model-body.mdx'),
    prettierTarget: 'src/generated/clawql-plugin-model-body.mdx',
  },
  {
    srcRelative: path.join('docs', 'reference', 'clawql-plugin-registry.md'),
    dst: path.join(dstDir, 'clawql-plugin-registry-body.mdx'),
    prettierTarget: 'src/generated/clawql-plugin-registry-body.mdx',
  },
]

function findRepoRootWithDocs() {
  let dir = websiteRoot
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'docs'))) {
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

function rewritePluginDocAnchors(body) {
  return body
    .replaceAll(
      '](../design/clawql-plugin-model.md)',
      '](../design/clawql-plugin-model.md#plugin-model)',
    )
    .replaceAll(
      '](./clawql-plugin-model.md)',
      '](./clawql-plugin-model.md#plugin-model)',
    )
    .replaceAll(
      '](../reference/clawql-plugin-registry.md)',
      '](../reference/clawql-plugin-registry.md#plugin-registry)',
    )
    .replaceAll(
      '](./clawql-plugin-registry.md)',
      '](./clawql-plugin-registry.md#plugin-registry)',
    )
}

fs.mkdirSync(dstDir, { recursive: true })

const repoRoot = findRepoRootWithDocs()

for (const job of JOBS) {
  const src = repoRoot ? path.join(repoRoot, job.srcRelative) : null
  if (!src || !fs.existsSync(src)) {
    if (fs.existsSync(job.dst)) {
      console.warn(
        `sync-clawql-plugin-docs: ${job.srcRelative} not found; keeping ${path.basename(job.dst)}`,
      )
      continue
    }
    console.error(
      'sync-clawql-plugin-docs: missing source',
      job.srcRelative,
      'and no generated MDX at',
      job.dst,
    )
    process.exit(1)
  }
  const raw = fs.readFileSync(src, 'utf8')
  const withAnchors = rewritePluginDocAnchors(raw)
  fs.writeFileSync(
    job.dst,
    prepareMdxBody(withAnchors, job.srcRelative),
    'utf8',
  )
  execSync(`npx prettier --write ${job.prettierTarget}`, {
    cwd: websiteRoot,
    stdio: 'inherit',
  })
}
