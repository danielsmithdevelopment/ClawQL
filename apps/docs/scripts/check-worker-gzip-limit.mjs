#!/usr/bin/env node
/**
 * Fail the docs deploy if OpenNext handler.mjs gzip size reaches the Cloudflare
 * Workers free-plan script limit (3 MiB). Prefer failing in CI over a silent
 * wrangler reject after a long build.
 *
 * Limit: 3 MiB = 3145728 bytes. Soft ceiling leaves headroom for small pages.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const handler = path.join(
  websiteRoot,
  '.open-next/server-functions/default/handler.mjs',
)

const HARD_LIMIT = 3 * 1024 * 1024 // 3145728
const SOFT_CEILING = 3000 * 1024 // warn / fail early with margin

if (!fs.existsSync(handler)) {
  console.error('check-worker-gzip-limit: missing', handler)
  process.exit(1)
}

const gzipBytes = Number(
  execSync(`gzip -c "${handler}" | wc -c`, { encoding: 'utf8' }).trim(),
)
const gzipKiB = gzipBytes / 1024
const uncBytes = fs.statSync(handler).size

console.log(
  `handler.mjs: ${(uncBytes / 1024 / 1024).toFixed(2)} MiB unc / ${gzipKiB.toFixed(2)} KiB gzip (limit ${HARD_LIMIT / 1024} KiB)`,
)

if (gzipBytes >= HARD_LIMIT) {
  console.error(
    'FAIL: Worker gzip ≥ 3 MiB free-plan limit. Externalize more generated MDX bodies via AgentMarkdownDocBody / agent-markdown.json (ASSETS), do not re-import @/generated/*-body.mdx into pages.',
  )
  process.exit(1)
}

if (gzipBytes >= SOFT_CEILING) {
  console.error(
    `FAIL: Worker gzip ${gzipKiB.toFixed(2)} KiB ≥ soft ceiling 3000 KiB. Leave margin before the hard 3072 KiB limit.`,
  )
  process.exit(1)
}

console.log('OK: under soft ceiling')
