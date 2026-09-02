#!/usr/bin/env node
/**
 * Emit SecurityScanRunRecord JSON for the supply-chain CI job (always, pass or fail).
 * See docs/design/security-status-page-spec.md
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()

/** @param {string | undefined} path */
function readJsonIfExists(path) {
  if (!path || !existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/** @param {unknown} data */
function parseTrivyFindings(data) {
  /** @type {Array<{ cveId: string; severity: string; package: string; fixedVersion: string | null }>} */
  const out = []
  if (!data || typeof data !== 'object') return out
  const results = /** @type {{ Results?: unknown[] }} */ (data).Results
  if (!Array.isArray(results)) return out
  for (const block of results) {
    if (!block || typeof block !== 'object') continue
    const vulns = /** @type {{ Vulnerabilities?: unknown[] }} */ (block).Vulnerabilities
    if (!Array.isArray(vulns)) continue
    for (const v of vulns) {
      if (!v || typeof v !== 'object') continue
      const row = /** @type {{ VulnerabilityID?: string; Severity?: string; PkgName?: string; FixedVersion?: string }} */ (v)
      out.push({
        cveId: row.VulnerabilityID ?? 'UNKNOWN',
        severity: (row.Severity ?? 'unknown').toLowerCase(),
        package: row.PkgName ?? 'unknown',
        fixedVersion: row.FixedVersion ?? null,
      })
    }
  }
  return out
}

/** @param {unknown} data */
function parseOsvFindings(data) {
  /** @type {Array<{ osvId: string; severity: string; package: string; fixedVersion: string | null }>} */
  const out = []
  if (!data || typeof data !== 'object') return out
  const results = /** @type {{ results?: unknown[] }} */ (data).results
  if (!Array.isArray(results)) return out
  for (const pkg of results) {
    if (!pkg || typeof pkg !== 'object') continue
    const packageName =
      /** @type {{ package?: { name?: string; ecosystem?: string } }} */ (pkg).package?.name ??
      'unknown'
    const vulns = /** @type {{ vulnerabilities?: unknown[] }} */ (pkg).vulnerabilities
    if (!Array.isArray(vulns)) continue
    for (const v of vulns) {
      if (!v || typeof v !== 'object') continue
      const row = /** @type {{ id?: string; severity?: string[] | string }} */ (v)
      const sev = Array.isArray(row.severity) ? row.severity[0] : row.severity
      out.push({
        osvId: row.id ?? 'UNKNOWN',
        severity: sev ?? 'unknown',
        package: packageName,
        fixedVersion: null,
      })
    }
  }
  return out
}

const osvExit = Number(process.env.OSV_EXIT_CODE ?? '1')
const trivyPassed = process.env.TRIVY_STEP_OUTCOME === 'success'
const osvResults = readJsonIfExists(resolve(root, 'osv-results.json'))
const trivyResults = readJsonIfExists(resolve(root, 'trivy-results.json'))
const trivyFindings = parseTrivyFindings(trivyResults)
const osvFindings = parseOsvFindings(osvResults)

const osvPass = osvExit === 0
const trivyPass = trivyPassed && trivyFindings.length === 0
const scannersBlocked = !osvPass || !trivyPass

const repo = process.env.GITHUB_REPOSITORY ?? 'danielsmithdevelopment/ClawQL'
const runId = process.env.GITHUB_RUN_ID ?? 'local'
const commit = process.env.GITHUB_SHA ?? '0000000'
const branch = (process.env.GITHUB_REF ?? 'refs/heads/main').replace(/^refs\/heads\//, '')
const onMain = branch === 'main'
const sbomPath = resolve(root, 'sbom-cyclonedx-repo.cdx.json')
const sbomGenerated = existsSync(sbomPath)

const serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com'
const ciRunUrl = `${serverUrl}/${repo}/actions/runs/${runId}`

/** merged only when scanners pass on main; blocked otherwise */
const overallResult = !scannersBlocked && onMain ? 'merged' : 'blocked'

const record = {
  runId: String(runId),
  timestamp: new Date().toISOString(),
  commit: commit.slice(0, 40),
  branch,
  scanners: {
    trivy: {
      result: trivyPass ? 'pass' : 'fail',
      ...(trivyFindings.length > 0 ? { findings: trivyFindings.slice(0, 20) } : {}),
    },
    osv: {
      result: osvPass ? 'pass' : 'fail',
      ...(osvFindings.length > 0 ? { findings: osvFindings.slice(0, 20) } : {}),
    },
  },
  sbom: {
    generated: sbomGenerated,
    format: 'cyclonedx-json',
    artifactUrl: `${ciRunUrl}#artifacts`,
    artifactName: 'sbom-cyclonedx-repository',
  },
  signing: {
    signed: false,
    imageDigest: null,
  },
  overallResult,
  ciRunUrl,
}

writeFileSync(resolve(root, 'security-scan-run-record.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8')
console.log(`[security-scan-record] wrote run ${runId} (${overallResult})`)
