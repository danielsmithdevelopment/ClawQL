/**
 * Build FlexSearch source chunks for docs search (lazy-loaded per route segment).
 * Replaces inlining the full index in the search.mjs webpack loader.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  collectSearchIndexPages,
  groupPagesByChunk,
} from './lib/search-index-core.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const outDir = path.join(websiteRoot, 'public/search-index')
const appDir = path.join(websiteRoot, 'src/app')
const trainingDir = path.join(
  websiteRoot,
  'src/generated/security-training/bodies',
)
const generatedDir = path.join(websiteRoot, 'src/generated')
const pluginsBodiesDir = path.join(
  websiteRoot,
  'src/generated/clawql-plugins/bodies',
)

fs.mkdirSync(outDir, { recursive: true })

const pages = collectSearchIndexPages({
  appDir,
  trainingDir,
  generatedDir,
  pluginsBodiesDir,
})
const chunks = groupPagesByChunk(pages)

const manifestChunks = []

for (const [id, chunkPages] of [...chunks.entries()].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  const fileName = `chunk-${id}.json`
  fs.writeFileSync(
    path.join(outDir, fileName),
    `${JSON.stringify(chunkPages)}\n`,
    'utf8',
  )
  manifestChunks.push({ id, file: fileName, pages: chunkPages.length })
}

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  chunks: manifestChunks,
  totalPages: pages.length,
}

fs.writeFileSync(
  path.join(outDir, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
)

console.log(
  `generate-search-index: ${pages.length} pages in ${manifestChunks.length} chunks → public/search-index/`,
)
