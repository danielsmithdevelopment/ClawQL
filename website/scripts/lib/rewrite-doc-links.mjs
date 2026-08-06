/**
 * Rewrite relative `*.md` links in repo docs for docs.clawql.com rendering.
 * Used by website/scripts/sync-*.mjs generators.
 */
import path from 'node:path'

export const GH_MAIN =
  'https://github.com/danielsmithdevelopment/ClawQL/blob/main'

/** Repo-relative doc paths that have first-class site routes. */
export const DOC_SITE_ROUTES = {
  'docs/clawql-ecosystem.md': '/vision/roadmap',
  'docs/getting-started/phase-1-platform-guide.md':
    '/getting-started',
  'docs/getting-started/clawql-7-setup-guide.md':
    '/getting-started',
  'docs/getting-started/clawql-release-mvp.md':
    '/getting-started/immutable-releases',
  'docs/getting-started/immutable-releases.md':
    '/getting-started/immutable-releases',
  'docs/getting-started/getting-started-for-teams.md':
    '/getting-started/for-teams',
  'docs/getting-started/team-vault-sync.md':
    '/getting-started/for-teams#team-vault-sync',
  'docs/getting-started/cursor-ios-cloud-agent.md':
    '/agent-setup#cursor-i-os-cloud-agent',
  'docs/getting-started/cloud-agent-e2e-r2-memory.md':
    '/agent-setup#cursor-i-os-cloud-agent',
  'docs/getting-started/golden-host-images.md':
    '/getting-started/for-teams#golden-host-images',
  'docs/getting-started/local-agent-sandbox.md':
    '/agent-setup#local-agent-sandbox-mac-os-seatbelt',
  'docs/getting-started/agent-setup.md': '/agent-setup',
  'docs/getting-started/agent-setup-prompt.md': '/agent-setup',
  'docs/getting-started/inference.md': '/getting-started/inference',
  'docs/getting-started/custom-sources.md': '/getting-started/custom-sources',
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
  'docs/vision/clawql-master-enablement-guide.md': '/architecture',
  'docs/vision/clawql-modularization-v2.md': '/architecture',
  'docs/vision/clawql-idp-platform.md': '/vision/idp-platform',
  'docs/vision/clawql-hybrid-decentralized-github-alternative.md':
    '/vision/immutable-releases',
  'docs/design/clawql-plugin-model.md': '/plugins#plugin-model',
  'docs/reference/clawql-plugin-registry.md': '/plugins#registry',
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
  'docs/memory/memory-obsidian.md': '/learn/memory',
  'docs/ouroboros/clawql-ouroboros.md': '/ouroboros',
  'docs/inference/clawql-inference.md': '/inference/clawql-inference',
  'docs/payments/clawql-payments.md': '/payments/clawql-payments',
  'docs/surveillance/clawql-surveillance.md':
    '/surveillance/clawql-surveillance',
  'docs/architecture/clawql-token-efficiency.md':
    '/architecture/token-efficiency',
  'docs/architecture/enterprise-ontology.md':
    '/architecture/enterprise-ontology',
  'docs/specs/cq-extensions/README.md': '/specs/cq-extensions',
  'docs/specs/cq-extensions/cqe.md': '/specs/cq-extensions/cqe',
  'docs/specs/cq-extensions/cqm.md': '/specs/cq-extensions/cqm',
  'docs/specs/cq-extensions/cqk.md': '/specs/cq-extensions/cqk',
  'docs/specs/cq-extensions/cqw.md': '/specs/cq-extensions/cqw',
  'docs/architecture/zero-trust-agentic-fabric.md':
    '/architecture/agentic-fabric',
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

      const resolved = path.posix.normalize(
        path.posix.join(sourceDir, filePart),
      )

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

/** Passthrough wrapper for generated MDX fragments embedded in custom page.tsx shells. */
const MDX_BODY_WRAPPER_EXPORT = `
export function wrapper({ children }) {
  return children
}
`

/** @param {string} body */
export function appendPassthroughWrapper(body) {
  if (body.includes('export function wrapper')) {
    return body
  }
  return `${body}${MDX_BODY_WRAPPER_EXPORT}`
}

/** @param {string} body */
export function prepareMdxBody(body, sourceDocPathFromRepoRoot) {
  const rewritten = rewriteDocLinks(body, sourceDocPathFromRepoRoot)
  return appendPassthroughWrapper(rewritten)
}
