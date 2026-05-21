#!/usr/bin/env node
/**
 * Build docs/security/security-best-practices-series/NN-slug.md from
 * tools/security-curriculum-v30/manifest.json + bodies/NN.md
 *
 * Usage (repo root): node tools/security-curriculum-v30/build-modules.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const seriesDir = path.join(
  repoRoot,
  'docs/security/security-best-practices-series',
)
const bodiesDir = path.join(__dirname, 'bodies')
const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'),
)

function yamlList(items) {
  return items.map((t) => `  - ${t}`).join('\n')
}

function frontmatter(m, prev, next) {
  const lines = [
    '---',
    `title: ${JSON.stringify(m.title)}`,
    'series: "Agentic AI Security Curriculum"',
    `level: ${m.level}`,
    'tags:',
    yamlList(m.tags),
    `part: ${m.part}`,
    'total_parts: 30',
    'date: "May 2026"',
    `slug: "${m.slug}"`,
    `canonical_path: "/security/best-practices/${m.slug}"`,
    `description: ${JSON.stringify(m.description)}`,
  ]
  if (prev) lines.push(`prev: "${prev}"`)
  if (next) lines.push(`next: "${next}"`)
  lines.push('---', '')
  return lines.join('\n')
}

const slugs = manifest.map((m) => m.slug)
for (const m of manifest) {
  const nn = String(m.part).padStart(2, '0')
  const bodyPath = path.join(bodiesDir, `${nn}.md`)
  if (!fs.existsSync(bodyPath)) {
    console.error(`Missing body: ${bodyPath}`)
    process.exit(1)
  }
  const body = fs.readFileSync(bodyPath, 'utf8').trim()
  const prev = m.part > 1 ? slugs[m.part - 2] : undefined
  const next = m.part < 30 ? slugs[m.part] : undefined
  const out = path.join(seriesDir, `${nn}-${m.slug}.md`)
  fs.writeFileSync(out, `${frontmatter(m, prev, next)}${body}\n`, 'utf8')
  console.log(`wrote ${path.relative(repoRoot, out)}`)
}

// Remove legacy 20-module files not in v30 manifest
const keep = new Set(manifest.map((m) => `${String(m.part).padStart(2, '0')}-${m.slug}.md`))
for (const name of fs.readdirSync(seriesDir)) {
  if (!/^\d{2}-.+\.md$/.test(name)) continue
  if (keep.has(name)) continue
  const p = path.join(seriesDir, name)
  fs.unlinkSync(p)
  console.log(`removed legacy ${name}`)
}
