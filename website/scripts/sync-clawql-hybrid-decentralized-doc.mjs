/**
 * Copies the hybrid decentralized releases doc from docs/ into an MDX fragment
 * for /vision/immutable-releases (Layer 0 — clawql-release, Arweave, Rift).
 *
 * Source: docs/vision/clawql-hybrid-decentralized-github-alternative.md
 *   → src/generated/clawql-hybrid-decentralized-body.mdx
 *
 * Run from website/: node scripts/sync-clawql-hybrid-decentralized-doc.mjs
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { appendPassthroughWrapper } from './lib/rewrite-doc-links.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')
const dst = path.join(dstDir, 'clawql-hybrid-decentralized-body.mdx')
const srcRelative = path.join(
  'docs',
  'vision',
  'clawql-hybrid-decentralized-github-alternative.md',
)

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
          '](./clawql-modularization-v2.md)',
          '](/vision/modularization)',
        )
        .replaceAll('](./clawql-vision-roadmap.md)', '](/vision/roadmap)'),
    ),
  )
}

fs.mkdirSync(dstDir, { recursive: true })

const repoRoot = findRepoRootWithDocsVision()
const src = repoRoot ? path.join(repoRoot, srcRelative) : null

if (!src || !fs.existsSync(src)) {
  if (fs.existsSync(dst)) {
    console.warn(
      'sync-clawql-hybrid-decentralized-doc: source not found; keeping existing src/generated/clawql-hybrid-decentralized-body.mdx',
    )
    process.exit(0)
  }
  console.error(
    'sync-clawql-hybrid-decentralized-doc: missing source and no generated MDX at',
    dst,
  )
  process.exit(1)
}

const body = appendPassthroughWrapper(
  rewriteLinksForSite(fs.readFileSync(src, 'utf8')),
)
fs.writeFileSync(dst, body)
execSync(
  'npx prettier --write src/generated/clawql-hybrid-decentralized-body.mdx',
  {
    cwd: websiteRoot,
    stdio: 'inherit',
  },
)
