#!/usr/bin/env node
/**
 * CSP script-src helpers for docs.clawql.com (public/_headers).
 *
 * Hash production (CSP Level 2 §4.2.5):
 *   1. Exact UTF-8 bytes of the inline <script> body (no surrounding tags).
 *   2. SHA-256 → standard Base64.
 *   3. Emit as 'sha256-<base64>' in script-src.
 *
 * Known author scripts: sitewide JSON-LD (SiteStructuredData) + case-study JSON-LD
 * (CaseStudyStructuredData). style-src keeps 'unsafe-inline' for critical CSS.
 *
 * After OpenNext build, seal-csp-from-html.mjs unions every inline script under
 * .open-next/assets (Next flight) into the ASSETS _headers copy.
 *
 * See docs/website/csp-script-hashes.md.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** @param {string} body */
export function cspSha256Token(body) {
  const digest = crypto.createHash('sha256').update(body, 'utf8').digest('base64')
  return `'sha256-${digest}'`
}

/** @param {string[]} bodies */
export function scriptSrcFromBodies(bodies) {
  const tokens = [...new Set(bodies.map(cspSha256Token))].sort()
  return `script-src 'self' ${tokens.join(' ')}`
}

/**
 * Mirrors apps/docs/src/components/SiteStructuredData.tsx + JsonLd JSON.stringify.
 * @param {string} origin
 */
export function docsSiteJsonLdBody(origin) {
  const base = origin.replace(/\/$/, '')
  const logo = `${base}/ClawQL-logo.jpeg`
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${base}/#organization`,
        name: 'ClawQL',
        url: base,
        logo: { '@type': 'ImageObject', url: logo },
        sameAs: ['https://github.com/danielsmithdevelopment/ClawQL'],
      },
      {
        '@type': 'WebSite',
        '@id': `${base}/#website`,
        name: 'ClawQL documentation',
        url: base,
        inLanguage: 'en-US',
        publisher: { '@id': `${base}/#organization` },
      },
      {
        '@type': 'SoftwareSourceCode',
        name: 'ClawQL MCP',
        description:
          'MCP server for OpenAPI 3, Swagger 2, and Google Discovery: search and execute tools, optional sandbox and Obsidian memory, GraphQL projection, stdio or HTTP or gRPC.',
        codeRepository: 'https://github.com/danielsmithdevelopment/ClawQL',
        programmingLanguage: ['TypeScript'],
        license:
          'https://github.com/danielsmithdevelopment/ClawQL/blob/main/LICENSE',
        url: base,
        isAccessibleForFree: true,
      },
    ],
  }
  return JSON.stringify(data)
}

/** Infer YYYY-MM-01 from case-study path (same as CaseStudyStructuredData). */
function dateFromCaseStudyPath(p) {
  const match = p.match(/-(\d{4})-(\d{2})(?:\/|$)/)
  if (!match) return undefined
  return `${match[1]}-${match[2]}-01`
}

/**
 * Mirrors CaseStudyStructuredData.tsx for a fixed props set.
 * @param {string} origin
 * @param {{ headline: string, path: string, description: string, keywords?: string[] }} props
 */
export function docsCaseStudyJsonLdBody(origin, props) {
  const base = origin.replace(/\/$/, '')
  const url = `${base}${props.path.startsWith('/') ? props.path : `/${props.path}`}`
  const published = dateFromCaseStudyPath(props.path)
  const image = `${base}/og-image.png`
  const keywords = (props.keywords ?? ['ClawQL', 'MCP', 'case study']).join(', ')

  const article = {
    '@type': 'Article',
    '@id': `${url}#article`,
    headline: props.headline,
    description: props.description,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    inLanguage: 'en-US',
    isAccessibleForFree: true,
    articleSection: 'Case study',
    keywords,
    image: { '@type': 'ImageObject', url: image },
    author: {
      '@type': 'Organization',
      name: 'ClawQL',
      url: 'https://github.com/danielsmithdevelopment/ClawQL',
    },
    publisher: {
      '@type': 'Organization',
      name: 'ClawQL',
      logo: { '@type': 'ImageObject', url: image },
    },
    isPartOf: { '@id': `${base}/#website` },
  }
  if (published) {
    article.datePublished = published
    article.dateModified = published
  }

  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Examples',
            item: `${base}/examples`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: props.headline,
            item: url,
          },
        ],
      },
      article,
    ],
  }
  return JSON.stringify(data)
}

/** Props mirrored from apps/docs case-study page.mdx files. */
export const DOCS_CASE_STUDY_PROPS = [
  {
    headline: 'Case study: Deploying `docs.clawql.com` with ClawQL MCP',
    path: '/case-studies/cloudflare-docs-mcp',
    description:
      'Full narrative: Cloudflare Workers + OpenNext, search/execute for control plane, memory tools, fs/runtime failures, caching — same detail as docs/case_studies in the repo.',
  },
  {
    headline: 'Case study: cross-thread recall with Cuckoo / hybrid memory',
    path: '/case-studies/cross-thread-vault-recall',
    description:
      'Full narrative: repo-only vs memory_recall, Obsidian graph, search + execute on GitHub API — same detail as docs/case_studies in the repo.',
  },
  {
    headline:
      'Case study: `docs.clawql.com` Worker limits, MCP `search` / `execute`, and `memory_ingest` (Apr 2026)',
    path: '/case-studies/docs-clawql-worker-1102-mcp-memory-2026-04',
    description:
      'Incident: Error 1102 and waitUntil cancellations on the docs site; debugging with ClawQL search and execute on Cloudflare APIs; memory_ingest postmortem; Lighthouse CI and WCAG/SEO follow-ups.',
  },
  {
    headline:
      'Case study: OpenClaw agent chat → ClawQL `memory_recall` — cross-session vault knowledge (June 2026)',
    path: '/case-studies/openclaw-clawql-memory-recall-2026-06',
    description:
      'Full agent chat transcript: OpenClaw calls clawql__memory_recall and returns vault notes from prior sessions — validation for solo builders using agent gateways.',
  },
  {
    headline:
      'Case study: Slide deck vs GitHub — `memory_recall`, `cache`, and filing parity issues (April 2026)',
    path: '/case-studies/slide-deck-github-parity-cache-memory-recall-2026-04',
    description:
      'How memory_recall grounded a gap pass before new issues, cache() held ephemeral scratch, and memory_ingest closed the loop — same detail as docs/case_studies in the repo.',
  },
  {
    headline:
      'Case study: TrueNAS Scale (`corgicave`) — homelab networking, Mac client `errno 49`, vault memory, and SSH hardening (April 2026)',
    path: '/case-studies/truenas-scale-corgicave-homelab',
    description:
      'Full narrative: office switch island, Mac mini dual-homing and utun/Docker, memory_ingest/recall, Thunderbolt vs SSH, resolution and SSH hardening — same detail as docs/case_studies in the repo.',
  },
  {
    headline:
      'Case study: Vault memory ingest, GitHub tracking, and shipping enterprise `audit` (April 2026)',
    path: '/case-studies/vault-memory-github-session-2026-04',
    description:
      'Full session narrative: memory_ingest at scale, GitHub triage, prioritization, audit vertical slice, Helm and docs site wiring — same detail as docs/case_studies in the repo.',
  },
]

/** @param {string} origin */
export function docsKnownInlineScriptBodies(origin) {
  const bodies = [docsSiteJsonLdBody(origin)]
  for (const props of DOCS_CASE_STUDY_PROPS) {
    bodies.push(docsCaseStudyJsonLdBody(origin, props))
  }
  return bodies
}

const INLINE_SCRIPT_RE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi

/** @param {string} htmlDir */
export function collectInlineScriptBodiesFromHtmlDir(htmlDir) {
  const bodies = new Set()
  const stack = [htmlDir]
  while (stack.length) {
    const dir = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        stack.push(full)
        continue
      }
      if (!ent.isFile() || !ent.name.endsWith('.html')) continue
      const text = fs.readFileSync(full, 'utf8')
      INLINE_SCRIPT_RE.lastIndex = 0
      let m
      while ((m = INLINE_SCRIPT_RE.exec(text))) {
        bodies.add(m[1])
      }
    }
  }
  return [...bodies]
}

/** @param {string} headersText @param {string} scriptSrcDirective */
export function replaceScriptSrcInHeaders(headersText, scriptSrcDirective) {
  if (!/Content-Security-Policy:/i.test(headersText)) {
    throw new Error('No Content-Security-Policy line found in _headers')
  }
  if (!/script-src\s/i.test(headersText)) {
    throw new Error('CSP has no script-src directive to replace')
  }
  return headersText.replace(/script-src\s[^;]*/i, scriptSrcDirective)
}
