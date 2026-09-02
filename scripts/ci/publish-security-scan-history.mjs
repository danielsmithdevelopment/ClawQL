#!/usr/bin/env node
/**
 * Append new SecurityScanRunRecord artifacts from CI into website/public/security-scan-history.json.
 * Invoked by .github/workflows/security-status-publish.yml (scheduled, separate from scan job).
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'

const root = resolve(process.cwd())
const historyPath = resolve(root, 'website/public/security-scan-history.json')
const repo = process.env.GITHUB_REPOSITORY ?? 'danielsmithdevelopment/ClawQL'
const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
const maxRuns = Number(process.env.SECURITY_STATUS_MAX_RUNS ?? '30')
const serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com'

if (!token) {
  console.error('GITHUB_TOKEN required')
  process.exit(1)
}

/** @param {string} url */
async function ghJson(url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GitHub API ${res.status} ${url}: ${body.slice(0, 400)}`)
  }
  return res.json()
}

/** @param {string} url */
async function ghBuffer(url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status} download ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

/** @returns {import('./security-scan-history.types.js').SecurityStatusHistory} */
function loadHistory() {
  if (!existsSync(historyPath)) {
    return {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      latestRelease: buildLatestRelease(),
      runs: [],
    }
  }
  return JSON.parse(readFileSync(historyPath, 'utf8'))
}

function buildLatestRelease() {
  let version = '8.0.0'
  try {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
    if (pkg.version) version = pkg.version
  } catch {
    /* default */
  }
  return {
    version,
    published: null,
    commit: null,
    sbomFormat: 'cyclonedx-json',
    sbomArtifactName: 'sbom-cyclonedx-repository',
    image: {
      repository: 'ghcr.io/danielsmithdevelopment/clawql-mcp',
      digest: null,
      cosignVerifyCommand: `cosign verify ghcr.io/danielsmithdevelopment/clawql-mcp@sha256:<digest> \\
  --certificate-identity-regexp 'https://github\\.com/danielsmithdevelopment/ClawQL/.*' \\
  --certificate-oidc-issuer-regexp 'https://token\\.actions\\.githubusercontent\\.com.*'`,
    },
  }
}

/** @param {number} workflowRunId @param {string} destDir */
async function downloadSecurityRecord(workflowRunId, destDir) {
  const artifacts = await ghJson(
    `${serverUrl}/repos/${repo}/actions/runs/${workflowRunId}/artifacts?per_page=100`,
  )
  const list = /** @type {{ artifacts?: Array<{ id: number; name: string; expired: boolean }> }} */ (
    artifacts
  ).artifacts
  const hit = list?.find((a) => a.name === 'security-scan-run-record' && !a.expired)
  if (!hit) return null

  const zip = await ghBuffer(`${serverUrl}/repos/${repo}/actions/artifacts/${hit.id}/zip`)
  const zipPath = join(destDir, 'artifact.zip')
  writeFileSync(zipPath, zip)
  execFileSync('unzip', ['-o', '-q', zipPath, '-d', destDir])
  const recordPath = join(destDir, 'security-scan-run-record.json')
  if (!existsSync(recordPath)) return null
  return JSON.parse(readFileSync(recordPath, 'utf8'))
}

async function main() {
  const history = loadHistory()
  history.latestRelease = buildLatestRelease()
  const known = new Set(history.runs.map((r) => r.runId))

  const workflows = await ghJson(`${serverUrl}/repos/${repo}/actions/workflows?per_page=100`)
  const ci = /** @type {{ workflows?: Array<{ id: number; path: string }> }} */ (workflows).workflows?.find(
    (w) => w.path === '.github/workflows/ci.yml',
  )
  if (!ci) {
    console.error('CI workflow not found')
    process.exit(1)
  }

  const runsResp = await ghJson(
    `${serverUrl}/repos/${repo}/actions/workflows/${ci.id}/runs?branch=main&status=completed&per_page=50`,
  )
  const runs = /** @type {{ workflow_runs?: Array<{ id: number; head_branch: string }> }} */ (
    runsResp
  ).workflow_runs?.filter((r) => r.head_branch === 'main')

  if (!runs?.length) {
    console.log('No completed main CI runs found')
    writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`)
    return
  }

  const tmpBase = join(tmpdir(), `sec-status-${randomBytes(4).toString('hex')}`)
  mkdirSync(tmpBase, { recursive: true })

  try {
    for (const run of runs) {
      if (known.has(String(run.id))) continue
      const dir = join(tmpBase, String(run.id))
      mkdirSync(dir, { recursive: true })
      const record = await downloadSecurityRecord(run.id, dir)
      if (!record) continue
      history.runs.push(record)
      known.add(String(record.runId))
      console.log(`[security-status] appended run ${record.runId}`)
    }
  } finally {
    rmSync(tmpBase, { recursive: true, force: true })
  }

  history.runs.sort((a, b) => Number(b.runId) - Number(a.runId))
  history.runs = history.runs.slice(0, maxRuns)
  history.updatedAt = new Date().toISOString()

  mkdirSync(resolve(historyPath, '..'), { recursive: true })
  writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`)
  console.log(`[security-status] wrote ${history.runs.length} runs to ${historyPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
