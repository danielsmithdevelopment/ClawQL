/**
 * Rewrite relative `*.md` links in repo docs for docs.clawql.com rendering.
 * Used by website/scripts/sync-*.mjs generators.
 */
import path from 'node:path'

export const GH_MAIN = 'https://github.com/danielsmithdevelopment/ClawQL/blob/main'

/** Repo-relative doc paths that have first-class site routes. */
export const DOC_SITE_ROUTES = {
  'docs/clawql-ecosystem.md': '/vision/ecosystem',
  'docs/getting-started/phase-1-platform-guide.md':
    '/getting-started/phase-1-platform-guide',
  'docs/getting-started/clawql-7-setup-guide.md':
    '/getting-started/clawql-7-setup-guide',
  'docs/getting-started/clawql-release-mvp.md':
    '/getting-started/clawql-release-mvp',
  'docs/getting-started/getting-started-for-teams.md':
    '/getting-started/for-teams',
  'docs/getting-started/team-vault-sync.md':
    '/getting-started/team-vault-sync',
  'docs/deployment/clawql-deployment-operations-guide.md':
    '/deployment/operations-guide',
  'docs/deployment/helm.md': '/helm',
  'docs/providers/idp-pipeline.md': '/learn/document-pipeline',
  'docs/mcp/mcp-tools.md': '/tools',
  'docs/mcp/workflow-tool.md': '/learn/schedule-notify-workflows',
  'docs/mcp/notify-tool.md': '/notify',
  'docs/mcp/argocd-tool.md': '/learn/schedule-notify-workflows',
  'docs/mcp/idp-pipeline-runner.md': '/learn/document-pipeline',
  'docs/mcp/hitl-label-studio.md': '/hitl-label-studio',
  'docs/vision/clawql-vision-roadmap.md': '/vision/roadmap',
  'docs/vision/clawql-master-enablement-guide.md': '/vision/technical-enablement',
  'docs/vision/clawql-modularization-v2.md': '/vision/modularization',
  'docs/vision/clawql-idp-platform.md': '/vision/idp-platform',
  'docs/vision/clawql-hybrid-decentralized-github-alternative.md':
    '/vision/immutable-releases',
  'docs/design/clawql-plugin-model.md': '/reference/plugins',
  'docs/design/operator-target-architecture.md':
    '/design/operator-target-architecture',
  'docs/contributing/clawql-contributor-technical-specification.md':
    '/contributing/technical-specification',
  'docs/observability/README.md': '/docker-desktop-observability',
  'docs/observability/idp-trace-and-metrics-guide.md':
    '/learn/audit-tool-and-observability',
  'docs/observability/bring-your-own-observability.md':
    '/learn/audit-tool-and-observability',
  'docs/observability/bundled-observability.md':
    '/docker-desktop-observability',
  'docs/grafana/README.md': '/learn/audit-tool-and-observability',
  'docs/memory/memory-obsidian.md': '/learn/vault-memory-between-chats',
  'docs/ouroboros/clawql-ouroboros.md': '/ouroboros',
  'docs/security/clawql-security-defense-in-depth.md':
    '/security/defense-in-depth',
  'docs/security/security-best-practices-series/README.md':
    '/security/best-practices',
}

export function escapeLessThanBeforeDigit(body) {
  return body.replace(/<(?=\d)/g, '&lt;')
}

/** MDX treats `<http://...>` as JSX; escape autolink angle brackets outside fences. */
export function escapeAngleBracketAutolinks(body) {
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
      return line.replace(/<https?:\/\/[^>\s]+>/g, (match) =>
        match.replace(/</g, '&lt;').replace(/>/g, '&gt;'),
      )
    })
    .join('\n')
}

export function escapeMdxCurlyOutsideFences(body) {
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

/**
 * @param {string} body
 * @param {string} sourceDocPathFromRepoRoot e.g. `docs/presentations/clawql-slides.md`
 */
export function rewriteDocLinks(body, sourceDocPathFromRepoRoot) {
  const sourceDir = path.posix.dirname(
    sourceDocPathFromRepoRoot.replace(/\\/g, '/'),
  )

  const rewritten = body.replace(
    /\]\(([^)]+\.md(?:#[^)]*)?)\)/g,
    (match, linkPath) => {
      if (
        linkPath.startsWith('http://') ||
        linkPath.startsWith('https://') ||
        linkPath.startsWith('mailto:')
      ) {
        return match
      }

      const hashIdx = linkPath.indexOf('#')
      const filePart = hashIdx >= 0 ? linkPath.slice(0, hashIdx) : linkPath
      const hash = hashIdx >= 0 ? linkPath.slice(hashIdx) : ''

      const resolved = path.posix.normalize(path.posix.join(sourceDir, filePart))

      if (DOC_SITE_ROUTES[resolved]) {
        return `](${DOC_SITE_ROUTES[resolved]}${hash})`
      }

      return `](${GH_MAIN}/${resolved}${hash})`
    },
  )

  return escapeMdxCurlyOutsideFences(
    escapeAngleBracketAutolinks(escapeLessThanBeforeDigit(rewritten)),
  )
}

/** @param {string} body */
export function prepareMdxBody(body, sourceDocPathFromRepoRoot) {
  return rewriteDocLinks(body, sourceDocPathFromRepoRoot)
}
