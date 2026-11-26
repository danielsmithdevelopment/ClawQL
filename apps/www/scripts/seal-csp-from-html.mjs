#!/usr/bin/env node
/**
 * Postbuild: rewrite out/_headers script-src from every inline script in the
 * static export HTML tree. See csp-script-hashes.mjs and docs/website/csp-script-hashes.md.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collectInlineScriptBodiesFromHtmlDir,
  replaceScriptSrcInHeaders,
  scriptSrcFromBodies,
} from './csp-script-hashes.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '../out')
const headersPath = path.join(outDir, '_headers')

if (!fs.existsSync(outDir)) {
  console.error('[seal-csp] missing out/ — run next build first')
  process.exit(1)
}
if (!fs.existsSync(headersPath)) {
  console.error('[seal-csp] missing out/_headers')
  process.exit(1)
}

const bodies = collectInlineScriptBodiesFromHtmlDir(outDir)
if (bodies.length === 0) {
  console.error('[seal-csp] no inline scripts found under out/')
  process.exit(1)
}

const scriptSrc = scriptSrcFromBodies(bodies)
const before = fs.readFileSync(headersPath, 'utf8')
const after = replaceScriptSrcInHeaders(before, scriptSrc)
fs.writeFileSync(headersPath, after)
console.log(
  `[seal-csp] Wrote script-src with ${bodies.length} inline hash(es) → ${path.relative(process.cwd(), headersPath)}`,
)
