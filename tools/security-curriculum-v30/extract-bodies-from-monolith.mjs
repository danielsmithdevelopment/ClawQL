#!/usr/bin/env node
/**
 * Split docs/security/security-guide-series.md "Module N:" narratives into
 * tools/security-curriculum-v30/bodies/NN.md (strips emoji, normalizes headings).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const monolith = path.join(repoRoot, 'docs/security/security-guide-series.md')
const bodiesDir = path.join(__dirname, 'bodies')
const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'),
)

const raw = fs.readFileSync(monolith, 'utf8')
const moduleRe = /^Module (\d+):[^\n]*\n/gm
const outlineRe = /^## \*\*MODULE (\d+)\*\*/gm
const hits = [...raw.matchAll(moduleRe)]
if (hits.length < 30) {
  console.error(`Expected 30 Module sections, found ${hits.length}`)
  process.exit(1)
}

/** End narrative before duplicated outline block for the next module. */
function sectionEnd(startIndex, part) {
  const nextModule = hits.find((h) => h.index > startIndex && Number(h[1]) > part)
  const nextOutline = [...raw.matchAll(outlineRe)].find(
    (h) => h.index > startIndex && Number(h[1]) > part,
  )
  const candidates = []
  if (nextModule) candidates.push(nextModule.index)
  if (nextOutline) candidates.push(nextOutline.index)
  if (candidates.length === 0) return raw.length
  return Math.min(...candidates)
}

function stripEmoji(s) {
  return s.replace(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,
    '',
  )
}

function toBody(section, titleFromManifest) {
  let t = stripEmoji(section).trim()
  // Drop duplicate short title line after "Module N: ..."
  t = t.replace(/^Module \d+:[^\n]*\n+/, '')
  // Promote narrative H1 from manifest
  const lines = t.split('\n')
  const h1 = `# ${titleFromManifest}`
  // Remove leading "Hello and welcome" duplicate titles if present
  while (lines.length && /^#+\s/.test(lines[0])) lines.shift()
  return `${h1}\n\n${lines.join('\n').trim()}\n`
}

for (let i = 0; i < hits.length; i++) {
  const part = Number(hits[i][1])
  const start = hits[i].index
  const end = sectionEnd(start, part)
  const chunk = raw.slice(start, end)
  const m = manifest.find((x) => x.part === part)
  if (!m) {
    console.error(`No manifest entry for part ${part}`)
    process.exit(1)
  }
  const nn = String(part).padStart(2, '0')
  const out = path.join(bodiesDir, `${nn}.md`)
  fs.writeFileSync(out, toBody(chunk, m.title), 'utf8')
  console.log(`extracted ${nn}.md (${fs.statSync(out).size} bytes)`)
}
