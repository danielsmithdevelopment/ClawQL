#!/usr/bin/env node
/**
 * After OpenNext build: rewrite ASSETS _headers script-src from every inline
 * <script> under .open-next/assets (and optional extra roots).
 *
 * Usage:
 *   node scripts/seal-csp-from-html.mjs
 *   node scripts/seal-csp-from-html.mjs --headers .open-next/assets/_headers --html .open-next/assets
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
const appRoot = path.join(__dirname, '..')

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag)
  if (i >= 0 && process.argv[i + 1]) return path.resolve(process.argv[i + 1])
  return fallback
}

const defaultAssets = path.join(appRoot, '.open-next/assets')
const htmlDir = argValue('--html', defaultAssets)
const headersPath = argValue(
  '--headers',
  path.join(htmlDir, '_headers'),
)

if (!fs.existsSync(htmlDir)) {
  console.error(`[seal-csp] missing HTML root: ${htmlDir}`)
  process.exit(1)
}
if (!fs.existsSync(headersPath)) {
  // Fall back to public/_headers copy if assets root has no _headers yet
  const publicHeaders = path.join(appRoot, 'public/_headers')
  if (!fs.existsSync(publicHeaders)) {
    console.error(`[seal-csp] missing _headers at ${headersPath}`)
    process.exit(1)
  }
  fs.mkdirSync(path.dirname(headersPath), { recursive: true })
  fs.copyFileSync(publicHeaders, headersPath)
  console.log(`[seal-csp] seeded ${headersPath} from public/_headers`)
}

const bodies = collectInlineScriptBodiesFromHtmlDir(htmlDir)
if (bodies.length === 0) {
  console.error(`[seal-csp] no inline scripts under ${htmlDir}`)
  process.exit(1)
}

const scriptSrc = scriptSrcFromBodies(bodies)
const before = fs.readFileSync(headersPath, 'utf8')
const after = replaceScriptSrcInHeaders(before, scriptSrc)
fs.writeFileSync(headersPath, after)

// Keep public/_headers author-known hashes in sync when sealing the public copy path
const publicHeaders = path.join(appRoot, 'public/_headers')
if (path.resolve(headersPath) === path.resolve(publicHeaders)) {
  console.log(`[seal-csp] Wrote ${bodies.length} hash(es) → public/_headers`)
} else {
  console.log(
    `[seal-csp] Wrote script-src with ${bodies.length} inline hash(es) → ${path.relative(appRoot, headersPath)}`,
  )
}
