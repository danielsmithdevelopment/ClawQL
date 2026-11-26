#!/usr/bin/env node
/**
 * Patch apps/docs/public/_headers CSP script-src with sha256 hashes of known
 * inline JSON-LD (sitewide + case studies). style-src keeps 'unsafe-inline'.
 *
 * Run from apps/docs/: node scripts/generate-public-headers-csp.mjs
 * Wired into prebuild. Full Next flight hashes are sealed after OpenNext build
 * (scripts/seal-csp-from-html.mjs). See docs/website/csp-script-hashes.md.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  docsKnownInlineScriptBodies,
  replaceScriptSrcInHeaders,
  scriptSrcFromBodies,
} from './csp-script-hashes.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const headersPath = path.join(__dirname, '../public/_headers')
const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://docs.clawql.com').replace(
  /\/$/,
  '',
)

const before = fs.readFileSync(headersPath, 'utf8')
const scriptSrc = scriptSrcFromBodies(docsKnownInlineScriptBodies(origin))
let after = replaceScriptSrcInHeaders(before, scriptSrc)

// Ensure a short comment exists once above the CSP block for operators.
if (!after.includes('csp-script-hashes.md')) {
  after = after.replace(
    /Content-Security-Policy:/,
    `# CSP script-src: sha256 of known JSON-LD; seal Next flight hashes after OpenNext (docs/website/csp-script-hashes.md)\n  Content-Security-Policy:`,
  )
}

fs.writeFileSync(headersPath, after)
console.log(
  `[headers-csp] Updated script-src (${docsKnownInlineScriptBodies(origin).length} known inline bodies) → public/_headers`,
)
