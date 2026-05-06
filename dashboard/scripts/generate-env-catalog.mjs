#!/usr/bin/env node
/**
 * Parse repo-root `.env.example` into grouped keys for the dashboard form.
 * Sections: lines like `# ─── Title ───`; keys: `# VAR=` or `VAR=value`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const envPath = path.join(repoRoot, '.env.example')
const outDir = path.join(__dirname, '../src/generated')
const outPath = path.join(outDir, 'env-catalog.json')

const text = fs.readFileSync(envPath, 'utf8')
const lines = text.split(/\r?\n/)

/** @type {{ title: string, keys: { key: string, sensitive: boolean }[] }[]} */
const sections = []
let current = { title: 'General', keys: [] }

function pushSection() {
  if (current.keys.length === 0 && sections.length > 0 && current.title === 'General') return
  sections.push(current)
}

const sectionLine = /^#\s*───\s*(.+?)\s*───/
const keyCommented = /^\s*#\s*([A-Z][A-Z0-9_]*)\s*=/
const keyBare = /^\s*([A-Z][A-Z0-9_]*)\s*=/

for (const line of lines) {
  const sec = line.match(sectionLine)
  if (sec) {
    pushSection()
    current = { title: sec[1].trim(), keys: [] }
    continue
  }
  let m = line.match(keyCommented)
  if (!m) m = line.match(keyBare)
  if (m) {
    const key = m[1]
    if (!current.keys.some((k) => k.key === key)) {
      current.keys.push({
        key,
        sensitive: /TOKEN|SECRET|PASSWORD|AUTH_JSON|API_KEY|_KEY$/i.test(key),
      })
    }
  }
}
pushSection()

// Drop empty sections
const filtered = sections.filter((s) => s.keys.length > 0)

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(outPath, JSON.stringify({ sections: filtered, source: '.env.example' }, null, 2))
console.error(`Wrote ${filtered.length} sections (${filtered.reduce((n, s) => n + s.keys.length, 0)} keys) → ${outPath}`)
