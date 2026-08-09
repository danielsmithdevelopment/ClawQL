/**
 * Sync memory + ontology companion specs into MDX for docs.clawql.com.
 *
 * - docs/specs/memory/memory-recall-structured-filter-v0.1.md
 *     → /specs/memory/memory-recall-structured-filter
 * - docs/specs/ontology/legal-domain-v0.1.md
 *     → /specs/ontology/legal-domain
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { prepareMdxBody } from './lib/rewrite-doc-links.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')

const SPECS = [
  {
    src: 'docs/specs/memory/memory-recall-structured-filter-v0.1.md',
    body: 'memory-recall-structured-filter-body.mdx',
  },
  {
    src: 'docs/specs/ontology/legal-domain-v0.1.md',
    body: 'ontology-legal-domain-body.mdx',
  },
]

function findRepoRootWithDocs() {
  let dir = websiteRoot
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'docs'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/** Strip leading YAML frontmatter — MDX treats `---` poorly as page body. */
function stripLeadingFrontmatter(raw) {
  if (!raw.startsWith('---\n')) return raw
  const end = raw.indexOf('\n---\n', 4)
  if (end === -1) return raw
  return raw.slice(end + '\n---\n'.length).replace(/^\n+/, '')
}

fs.mkdirSync(dstDir, { recursive: true })
const repoRoot = findRepoRootWithDocs()

for (const spec of SPECS) {
  const dst = path.join(dstDir, spec.body)
  const src = repoRoot ? path.join(repoRoot, spec.src) : null
  if (!src || !fs.existsSync(src)) {
    if (fs.existsSync(dst)) {
      console.warn(
        `sync-memory-ontology-specs-docs: missing ${spec.src}; keeping ${spec.body}`,
      )
      continue
    }
    console.error(`sync-memory-ontology-specs-docs: missing ${spec.src}`)
    process.exit(1)
  }
  const body = stripLeadingFrontmatter(fs.readFileSync(src, 'utf8'))
  fs.writeFileSync(
    dst,
    prepareMdxBody(body, spec.src.replace(/\\/g, '/')),
    'utf8',
  )
  try {
    execSync(`npx prettier --write src/generated/${spec.body}`, {
      cwd: websiteRoot,
      stdio: 'inherit',
    })
  } catch {
    console.warn(
      `sync-memory-ontology-specs-docs: prettier unavailable for ${spec.body}`,
    )
  }
  console.log(
    'sync-memory-ontology-specs-docs: wrote',
    path.relative(websiteRoot, dst),
  )
}
