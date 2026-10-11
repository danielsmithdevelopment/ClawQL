/**
 * Catalog ↔ Playwright coverage: every catalog ID must appear in exactly one
 * non-quarantine spec matching its `run` tier. Fails on missing or double-counted IDs.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { CLOUD_E2E_SCENARIOS, type ScenarioRun } from './scenarios'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SPECS_ROOT = path.join(__dirname, '../specs')

const TIER_DIR: Record<ScenarioRun, string> = {
  Smoke: 'smoke',
  Nightly: 'nightly',
  Manual: 'manual',
}

/** Match `test('SU-01 ...')`, `test("GW-02 ...")`, or `test(\`${id} ...`)` / for-of id lists. */
const TEST_TITLE_ID = /test\(\s*(?:['"`]|\$\{)([A-Z]+-\d+)/g
const FOR_OF_IDS = /for\s*\(\s*const\s+id\s+of\s*\[([^\]]+)\]/g
const QUOTED_ID = /['"]([A-Z]+-\d+)['"]/g

function walkSpecs(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (name === '_quarantine') continue
    const st = statSync(full)
    if (st.isDirectory()) walkSpecs(full, out)
    else if (name.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

export type CoverageHit = { id: string; file: string; tier: ScenarioRun | 'unknown' }

function tierForFile(file: string): ScenarioRun | 'unknown' {
  const rel = path.relative(SPECS_ROOT, file).replace(/\\/g, '/')
  if (rel.startsWith('smoke/')) return 'Smoke'
  if (rel.startsWith('nightly/')) return 'Nightly'
  if (rel.startsWith('manual/')) return 'Manual'
  return 'unknown'
}

export function collectSpecIds(specsRoot = SPECS_ROOT): CoverageHit[] {
  const hits: CoverageHit[] = []
  for (const file of walkSpecs(specsRoot)) {
    const text = readFileSync(file, 'utf8')
    const tier = tierForFile(file)
    const found = new Set<string>()
    for (const m of text.matchAll(TEST_TITLE_ID)) found.add(m[1]!)
    for (const m of text.matchAll(FOR_OF_IDS)) {
      for (const idm of m[1]!.matchAll(QUOTED_ID)) found.add(idm[1]!)
    }
    for (const id of found) hits.push({ id, file, tier })
  }
  return hits
}

export type CoverageReport = {
  catalogSize: number
  missing: string[]
  wrongTier: { id: string; expected: ScenarioRun; actual: string; file: string }[]
  doubleCounted: { id: string; files: string[] }[]
  ok: boolean
}

export function catalogSpecCoverageReport(specsRoot = SPECS_ROOT): CoverageReport {
  const hits = collectSpecIds(specsRoot)
  const byId = new Map<string, CoverageHit[]>()
  for (const h of hits) {
    const list = byId.get(h.id) ?? []
    list.push(h)
    byId.set(h.id, list)
  }

  const missing: string[] = []
  const wrongTier: CoverageReport['wrongTier'] = []
  const doubleCounted: CoverageReport['doubleCounted'] = []

  for (const scenario of CLOUD_E2E_SCENARIOS) {
    const list = byId.get(scenario.id) ?? []
    const files = [...new Set(list.map((h) => h.file))]
    const expectedDir = TIER_DIR[scenario.run]
    const correctFiles = files.filter((f) =>
      f.replace(/\\/g, '/').includes(`/specs/${expectedDir}/`),
    )

    if (correctFiles.length === 0) {
      missing.push(scenario.id)
    }
    if (files.length > 1) {
      doubleCounted.push({ id: scenario.id, files })
    }
    for (const h of list) {
      if (h.tier !== scenario.run) {
        wrongTier.push({
          id: scenario.id,
          expected: scenario.run,
          actual: h.tier,
          file: h.file,
        })
      }
    }
  }

  return {
    catalogSize: CLOUD_E2E_SCENARIOS.length,
    missing,
    wrongTier,
    doubleCounted,
    ok: missing.length === 0 && wrongTier.length === 0 && doubleCounted.length === 0,
  }
}

export function assertCatalogSpecCoverage(): void {
  const report = catalogSpecCoverageReport()
  if (report.ok) return
  const parts: string[] = ['Catalog ↔ Playwright coverage failed:']
  if (report.missing.length) {
    parts.push(`  missing (${report.missing.length}): ${report.missing.join(', ')}`)
  }
  if (report.doubleCounted.length) {
    parts.push(
      `  double-counted (${report.doubleCounted.length}): ${report.doubleCounted
        .map((d) => `${d.id} → ${d.files.map((f) => path.basename(f)).join(' + ')}`)
        .join('; ')}`,
    )
  }
  if (report.wrongTier.length) {
    parts.push(
      `  wrong tier (${report.wrongTier.length}): ${report.wrongTier
        .slice(0, 20)
        .map((w) => `${w.id} expected ${w.expected} got ${w.actual}`)
        .join('; ')}`,
    )
  }
  throw new Error(parts.join('\n'))
}
