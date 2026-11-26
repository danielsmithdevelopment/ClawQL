#!/usr/bin/env node
/**
 * CSP script-src helpers for clawql.com static export.
 *
 * Hash production (CSP Level 2 §4.2.5):
 *   1. Take the exact UTF-8 bytes of the inline <script> body (no surrounding tags).
 *   2. SHA-256 digest → standard Base64 (not hex).
 *   3. Emit as 'sha256-<base64>' in script-src.
 *
 * `generate-agent-assets.mjs` seeds public/_headers with known author scripts
 * (JSON-LD). `seal-csp-from-html.mjs` (postbuild) unions every inline script
 * found under the static export HTML tree (including Next/Turbopack flight
 * bootstraps) and rewrites out/_headers so 'unsafe-inline' is not required.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** @param {string} body Exact inline script text (UTF-8). */
export function cspSha256Token(body) {
  const digest = crypto.createHash('sha256').update(body, 'utf8').digest('base64')
  return `'sha256-${digest}'`
}

/**
 * Sitewide JSON-LD bodies must match apps/www/src/components/SiteStructuredData.tsx
 * when rendered with the same origin (JSON.stringify key order / values).
 * @param {string} origin e.g. https://clawql.com
 * @returns {string[]}
 */
export function wwwJsonLdScriptBodies(origin) {
  const base = origin.replace(/\/$/, '')
  const LOGO = '/ClawQL-logo.jpeg'
  const site = {
    name: 'ClawQL',
    description:
      'ClawQL is agentic infrastructure for production work in regulated industries. Autonomous event-driven agents, structured institutional knowledge recall, a software-simulated TEE path today (hardware adapters planned), and a hash-chained WORM audit trail on every action (local trail on by default; remote durable copies default on Cloud paid tiers and the regulated profile). Apache 2.0.',
    urls: {
      github: 'https://github.com/danielsmithdevelopment/ClawQL',
      npm: 'https://www.npmjs.com/package/clawql-mcp',
      twitter: 'https://x.com/clawql',
    },
  }

  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.name,
    url: base,
    logo: `${base}${LOGO}`,
    description: site.description,
    email: 'hello@clawql.com',
    sameAs: [site.urls.github, site.urls.npm, site.urls.twitter],
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'hello@clawql.com',
        url: `${base}/contact/`,
        availableLanguage: ['English'],
      },
      {
        '@type': 'ContactPoint',
        contactType: 'sales',
        email: 'hello@clawql.com',
        url: `${base}/signup/`,
      },
    ],
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'US',
      addressLocality: 'Remote',
    },
  }

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    url: base,
    description: site.description,
    publisher: { '@type': 'Organization', name: site.name, url: base },
  }

  const software = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'clawql-mcp',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'cross-platform',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Self-host free forever (Apache 2.0). Managed tiers via early access.',
      url: `${base}/pricing/`,
    },
    downloadUrl: site.urls.npm,
    installUrl: `${base}/install`,
    softwareVersion: '8.0.0',
    url: base,
    codeRepository: site.urls.github,
  }

  return [organization, website, software].map((obj) => JSON.stringify(obj))
}

/** @param {string[]} bodies */
export function scriptSrcFromBodies(bodies) {
  const tokens = [...new Set(bodies.map(cspSha256Token))].sort()
  return `script-src 'self' ${tokens.join(' ')}`
}

const INLINE_SCRIPT_RE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi

/**
 * @param {string} htmlDir
 * @returns {string[]} unique inline script bodies
 */
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

/**
 * Replace script-src … (until next `;` or end of CSP value) inside a _headers file.
 * @param {string} headersText
 * @param {string} scriptSrcDirective full directive e.g. `script-src 'self' 'sha256-…'`
 */
export function replaceScriptSrcInHeaders(headersText, scriptSrcDirective) {
  if (!/Content-Security-Policy:/i.test(headersText)) {
    throw new Error('No Content-Security-Policy line found in _headers')
  }
  if (!/script-src\s/i.test(headersText)) {
    throw new Error('CSP has no script-src directive to replace')
  }
  return headersText.replace(/script-src\s[^;]*/i, scriptSrcDirective)
}
