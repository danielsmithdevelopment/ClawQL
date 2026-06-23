/**
 * Copies plugin model + plugin registry from docs/ into MDX fragments for
 * /reference/plugins.
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

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')
const GH_MAIN = 'https://github.com/danielsmithdevelopment/ClawQL/blob/main'

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
          '](../design/clawql-plugin-model.md)',
          '](/reference/plugins#plugin-model)',
        )
        .replaceAll(
          '](./clawql-plugin-model.md)',
          '](/reference/plugins#plugin-model)',
        )
        .replaceAll(
          '](../reference/clawql-plugin-registry.md)',
          '](/reference/plugins#plugin-registry)',
        )
        .replaceAll(
          '](./clawql-plugin-registry.md)',
          '](/reference/plugins#plugin-registry)',
        )
        .replaceAll(
          '](../contributing/clawql-contributor-technical-specification.md)',
          '](/contributing/technical-specification)',
        )
        .replaceAll(
          '](../design/modularization-implementation-status.md)',
          `](${GH_MAIN}/docs/design/modularization-implementation-status.md)`,
        )
        .replaceAll(
          '](./modularization-implementation-status.md)',
          `](${GH_MAIN}/docs/design/modularization-implementation-status.md)`,
        )
        .replaceAll(
          '](./effect-ts-modularization-rearchitecture-plan.md)',
          `](${GH_MAIN}/docs/design/effect-ts-modularization-rearchitecture-plan.md)`,
        )
        .replaceAll('](../mcp/mcp-tools.md)', '](/tools)')
        .replaceAll('](../mcp/external-ingest.md)', `](${GH_MAIN}/docs/mcp/external-ingest.md)`)
        .replaceAll(
          '](https://docs.clawql.com/reference/verticals)',
          '](/reference/verticals)',
        )
        .replaceAll(
          '](https://docs.clawql.com/learn/vault-memory-between-chats)',
          '](/learn/vault-memory-between-chats)',
        )
        .replaceAll(
          '](https://docs.clawql.com/learn/knowledge-search-onyx)',
          '](/learn/knowledge-search-onyx)',
        )
        .replaceAll('](https://docs.clawql.com/schedule)', '](/schedule)')
        .replaceAll('](https://docs.clawql.com/notify)', '](/notify)')
        .replaceAll(
          '](https://docs.clawql.com/learn/sandbox-exec)',
          '](/learn/sandbox-exec)',
        )
        .replaceAll('](https://docs.clawql.com/ouroboros)', '](/ouroboros)')
        .replaceAll(
          '](https://docs.clawql.com/hitl-label-studio)',
          '](/hitl-label-studio)',
        )
        .replaceAll('](../../docs/', `](${GH_MAIN}/docs/`)
        .replaceAll('](../docs/', `](${GH_MAIN}/docs/`),
    ),
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
  fs.writeFileSync(job.dst, rewriteLinksForSite(raw), 'utf8')
  execSync(`npx prettier --write ${job.prettierTarget}`, {
    cwd: websiteRoot,
    stdio: 'inherit',
  })
}
