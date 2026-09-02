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
  'docs/getting-started/migrate-to-8.0.md': '/getting-started/migrate-to-8.0',
  'docs/deployment/clawql-deployment-operations-guide.md':
    '/deployment/operations-guide',
  'docs/deployment/helm.md': '/helm',
  'docs/providers/idp-pipeline.md': '/learn/document-pipeline',
  'docs/mcp/mcp-tools.md': '/tools',
  'docs/mcp/mcp-api-adapter.md': '/mcp/mcp-api-adapter',
  'docs/mcp/mcp-ui.md': '/mcp/mcp-ui',
  'docs/mcp/protocol-fabric.md': '/mcp/protocol-fabric',
  'docs/gtm/protocol-fabric.md': '/mcp/protocol-fabric',
  'docs/design/protocol-fabric-loop-benchmark.md':
    '/mcp/protocol-fabric#proven-end-to-end-loop',
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
  'docs/memory/okf.md': '/memory/okf',
  'docs/ouroboros/clawql-ouroboros.md': '/ouroboros',
  'docs/ouroboros/daos-unified-architecture-specification-v2.7.md':
    '/ouroboros/daos',
  'docs/ouroboros/daos-coordination-layer-specification.md':
    '/ouroboros/specification',
  'docs/ouroboros/daos-build-plan-v2.7.1.md': '/ouroboros/build-plan',
  'docs/inference/clawql-inference.md': '/inference/clawql-inference',
  'docs/payments/clawql-payments.md': '/payments/clawql-payments',
  'docs/surveillance/clawql-surveillance.md':
    '/surveillance/clawql-surveillance',
  'docs/streams/clawql-streams.md': '/streams/clawql-streams',
  'docs/streams/clawql-durable-objects.md': '/streams/clawql-durable-objects',
  'docs/streams/clawql-celld.md': '/streams/clawql-celld',
  'docs/streams/clawql-cellrt.md': '/streams/clawql-cellrt',
  'docs/streams/clawql-tee.md': '/streams/clawql-tee',
  'docs/streams/clawql-tee-airgap-audit.md':
    '/streams/clawql-tee-airgap-audit',
  'docs/streams/clawql-qr-stream-transport.md':
    '/streams/clawql-qr-stream-transport',
  'docs/government/clawql-government.md': '/government/clawql-government',
  'docs/architecture/clawql-token-efficiency.md':
    '/architecture/token-efficiency',
  'docs/architecture/enterprise-ontology.md':
    '/architecture/enterprise-ontology',
  'docs/specs/cq-extensions/README.md': '/specs/cq-extensions',
  'docs/specs/cq-extensions/cqe.md': '/specs/cq-extensions/cqe',
  'docs/specs/cq-extensions/cqm.md': '/specs/cq-extensions/cqm',
  'docs/specs/cq-extensions/cqk.md': '/specs/cq-extensions/cqk',
  'docs/specs/cq-extensions/cqw.md': '/specs/cq-extensions/cqw',
  'docs/specs/memory/memory-recall-structured-filter-v0.1.md':
    '/specs/memory/memory-recall-structured-filter',
  'docs/specs/ontology/legal-domain-v0.1.md': '/specs/ontology/legal-domain',
  'docs/specs/network/clawql-network-v0.1.md': '/specs/network/clawql-network',
  'docs/agents/clawql-agents-spec-v0.1.md': '/agents/clawql-agents',
  'docs/architecture/zero-trust-agentic-fabric.md':
    '/architecture/agentic-fabric',
  'docs/security/clawql-security-defense-in-depth.md':
    '/security/defense-in-depth',
  'docs/security/clawql-defense-in-depth-security-guide.md':
    '/security/defense-in-depth',
  'docs/security/security-best-practices-series/README.md':
    '/security/best-practices',
  'docs/security/security-best-practices-series':
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

/** Repo trees that have no docs.clawql.com route — always point at GitHub. */
const REPO_TREE_PREFIXES = [
  'packages/',
  'examples/',
  'scripts/',
  'schemas/',
  'charts/',
  'providers/',
  'infra/',
  'crates/',
  'verticals/',
  '.github/',
  'data/',
  'docker/',
  'grafana/',
]

const GH_TREE = GH_MAIN.replace('/blob/main', '/tree/main')

/**
 * Absolute docs.clawql.com URLs that were mistakenly authored for repo paths.
 * Rewrite to GitHub so the live site does not 404.
 */
const MISTAKEN_SITE_REPO_PATHS = [
  '/packages/',
  '/examples/',
  '/scripts/',
  '/schemas/',
  '/charts/',
  '/providers/',
  '/infra/',
  '/crates/',
  '/docker/',
  '/grafana/',
  '/.github/',
  '/data/',
  '/verticals/',
]

/**
 * @param {string} resolved repo-relative path (no leading ./)
 * @param {string} hash including leading # or ''
 */
function hrefForResolvedRepoPath(resolved, hash = '') {
  const clean = resolved.replace(/^\.\//, '').replace(/\/$/, '')
  if (DOC_SITE_ROUTES[clean]) {
    return `${DOC_SITE_ROUTES[clean]}${hash}`
  }
  // Directory form of a mapped README route (e.g. security-best-practices-series/)
  if (DOC_SITE_ROUTES[`${clean}/README.md`]) {
    return `${DOC_SITE_ROUTES[`${clean}/README.md`]}${hash}`
  }
  if (REPO_TREE_PREFIXES.some((p) => clean === p.slice(0, -1) || clean.startsWith(p))) {
    const isProbablyDir =
      resolved.endsWith('/') ||
      !path.posix.extname(clean) ||
      REPO_TREE_PREFIXES.some((p) => clean === p.slice(0, -1))
    const base = isProbablyDir ? GH_TREE : GH_MAIN
    return `${base}/${clean}${hash}`
  }
  // Other relative docs without a site route → GitHub blob
  if (clean.startsWith('docs/') || clean.endsWith('.md') || clean.endsWith('.mdx')) {
    return `${GH_MAIN}/${clean}${hash}`
  }
  return null
}

/**
 * Absolute site paths that are really repo trees or missing .md companions.
 * @param {string} pathname pathname only (may include hash stripped)
 * @param {string} hash including leading # or ''
 */
function hrefForAbsoluteSitePath(pathname, hash = '') {
  const clean = pathname.replace(/^\//, '').replace(/\/$/, '')
  if (!clean) return null
  if (MISTAKEN_SITE_REPO_PATHS.some((p) => pathname.startsWith(p))) {
    // Grafana dashboards live under docs/grafana/ in-repo (not repo-root grafana/)
    let pathPart = clean
    if (pathPart.startsWith('grafana/')) {
      pathPart = `docs/${pathPart}`
    }
    const isDir = !path.posix.extname(pathPart)
    return `${isDir ? GH_TREE : GH_MAIN}/${pathPart}${hash}`
  }
  // Mistaken absolute links to markdown that should be GitHub or site routes
  if (clean.endsWith('.md') || clean.endsWith('.mdx')) {
    const asDocs = clean.startsWith('docs/') ? clean : `docs/${clean}`
    if (DOC_SITE_ROUTES[asDocs]) return `${DOC_SITE_ROUTES[asDocs]}${hash}`
    if (DOC_SITE_ROUTES[clean]) return `${DOC_SITE_ROUTES[clean]}${hash}`
    return `${GH_MAIN}/${asDocs.startsWith('docs/') ? asDocs : clean}${hash}`
  }
  return null
}

/**
 * @param {string} body
 * @param {string} sourceDocPathFromRepoRoot e.g. `docs/presentations/clawql-slides.md`
 */
export function rewriteDocLinks(body, sourceDocPathFromRepoRoot) {
  const sourceDir = path.posix.dirname(
    sourceDocPathFromRepoRoot.replace(/\\/g, '/'),
  )

  let rewritten = body.replace(
    // Markdown links: any relative path (not only *.md)
    /\]\(([^)]+)\)/g,
    (match, linkPath) => {
      if (
        linkPath.startsWith('http://') ||
        linkPath.startsWith('https://') ||
        linkPath.startsWith('mailto:') ||
        linkPath.startsWith('#')
      ) {
        // Absolute site paths that are really repo trees (mistaken docs.clawql.com authoring)
        if (linkPath.startsWith('https://docs.clawql.com/')) {
          try {
            const u = new URL(linkPath)
            const abs = hrefForAbsoluteSitePath(u.pathname, u.hash || '')
            if (abs) return `](${abs})`
          } catch {
            /* keep */
          }
        }
        return match
      }

      // Root-absolute paths on the docs site (e.g. /packages/..., /architecture/foo.md)
      if (linkPath.startsWith('/')) {
        const hashIdx = linkPath.indexOf('#')
        const pathPart = hashIdx >= 0 ? linkPath.slice(0, hashIdx) : linkPath
        const hash = hashIdx >= 0 ? linkPath.slice(hashIdx) : ''
        const abs = hrefForAbsoluteSitePath(pathPart, hash)
        if (abs) return `](${abs})`
        return match
      }

      const hashIdx = linkPath.indexOf('#')
      const filePart = hashIdx >= 0 ? linkPath.slice(0, hashIdx) : linkPath
      const hash = hashIdx >= 0 ? linkPath.slice(hashIdx) : ''

      const resolved = path.posix.normalize(
        path.posix.join(sourceDir, filePart),
      )

      const href = hrefForResolvedRepoPath(resolved, hash)
      if (href) return `](${href})`
      return match
    },
  )

  // Bare absolute mistaken site→repo links outside markdown (rare)
  rewritten = rewritten.replace(
    /https:\/\/docs\.clawql\.com(\/(?:packages|examples|scripts|schemas|charts|providers|infra|crates|docker|grafana|data|verticals|\.github)\/[^\s)"']+)/g,
    (_m, pathname) => {
      const pathPart = pathname.replace(/^\//, '').replace(/\/$/, '')
      const isDir = !path.posix.extname(pathPart)
      return `${isDir ? GH_TREE : GH_MAIN}/${pathPart}`
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
