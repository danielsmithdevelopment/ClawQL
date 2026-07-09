/**
 * Copies the Deployment & Operations Guide from docs/ into an MDX fragment
 * for /deployment/operations-guide.
 *
 * Source: docs/deployment/clawql-deployment-operations-guide.md
 *   → src/generated/clawql-deployment-operations-guide-body.mdx
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { prepareMdxBody } from './lib/rewrite-doc-links.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const dstDir = path.join(websiteRoot, 'src/generated')
const dst = path.join(dstDir, 'clawql-deployment-operations-guide-body.mdx')
const srcRelative = path.join(
  'docs',
  'deployment',
  'clawql-deployment-operations-guide.md',
)

const GH_MAIN = 'https://github.com/danielsmithdevelopment/ClawQL/blob/main'

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

function fixAutolinkUrls(body) {
  return body
    .replace(/<https:\/\/([^>]+)>/g, '[$1](https://$1)')
    .replace(/<http:\/\/([^>]+)>/g, '[$1](http://$1)')
}

function rewriteLinksForSite(body) {
  return escapeMdxCurlyOutsideFences(
    escapeLessThanBeforeDigit(
      fixAutolinkUrls(
        body
        .replaceAll(
          '](../vision/clawql-vision-roadmap.md)',
          '](/vision/roadmap)',
        )
        .replaceAll(
          '](../contributing/clawql-contributor-technical-specification.md)',
          '](/contributing/technical-specification)',
        )
        .replaceAll(
          '](../design/operator-target-architecture.md)',
          '](/design/operator-target-architecture)',
        )
        .replaceAll('](helm.md)', '](/helm)')
        .replaceAll('](deploy-k8s.md)', '](/deployment/kubernetes)')
        .replaceAll(
          '](../providers/idp-pipeline.md)',
          `](${GH_MAIN}/docs/providers/idp-pipeline.md)`,
        )
        .replaceAll(
          '](../providers/nextcloud-onboarding.md)',
          `](${GH_MAIN}/docs/providers/nextcloud-onboarding.md)`,
        )
        .replaceAll(
          '](../providers/coneshare-onboarding.md)',
          `](${GH_MAIN}/docs/providers/coneshare-onboarding.md)`,
        )
        .replaceAll(
          '](../mcp/onyx-knowledge-tool.md)',
          `](${GH_MAIN}/docs/mcp/onyx-knowledge-tool.md)`,
        )
        .replaceAll(
          '](../dashboard/agent-chat.md)',
          `](${GH_MAIN}/docs/dashboard/agent-chat.md)`,
        )
        .replaceAll(
          '](../readme/configuration.md#feature-tiers-architecture-diagram)',
          `](${GH_MAIN}/docs/readme/configuration.md#feature-tiers-architecture-diagram)`,
        )
        .replaceAll(
          '](../readme/troubleshooting.md)',
          '](/troubleshooting)',
        )
        .replaceAll(
          '](../docker/docker-desktop-observability.md)',
          '](/docker-desktop-observability)',
        )
        .replaceAll(
          '](../providers/idp-pipeline.md#helm-enable-the-full-stack)',
          `](${GH_MAIN}/docs/providers/idp-pipeline.md#helm-enable-the-full-stack)`,
        )
        .replaceAll('](../../docs/', `](${GH_MAIN}/docs/`)
        .replaceAll('](../docs/', `](${GH_MAIN}/docs/`),
      ),
    ),
  )
}

fs.mkdirSync(dstDir, { recursive: true })

const repoRoot = findRepoRootWithDocs()
const src = repoRoot ? path.join(repoRoot, srcRelative) : null

if (!src || !fs.existsSync(src)) {
  if (fs.existsSync(dst)) {
    console.warn(
      'sync-clawql-deployment-operations-guide-doc: source not found; keeping existing generated MDX',
    )
    process.exit(0)
  }
  console.error(
    'sync-clawql-deployment-operations-guide-doc: missing source and no generated MDX at',
    dst,
  )
  process.exit(1)
}

fs.writeFileSync(
  dst,
  prepareMdxBody(fs.readFileSync(src, 'utf8'), srcRelative),
  'utf8',
)
execSync(
  'npx prettier --write src/generated/clawql-deployment-operations-guide-body.mdx',
  { cwd: websiteRoot, stdio: 'inherit' },
)
