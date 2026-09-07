#!/usr/bin/env node
/**
 * Append new SecurityScanRunRecord artifacts from CI into website/public/security-scan-history.json.
 * Invoked by .github/workflows/security-status-publish.yml (scheduled, separate from scan job).
 *
 * API calls must use api.github.com (or GITHUB_API_URL). GITHUB_SERVER_URL is github.com and is
 * only for human-facing HTML links — using it for /repos/... API paths 404s (see failed cron runs).
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
const htmlServerUrl = (process.env.GITHUB_SERVER_URL ?? 'https://github.com').replace(/\/$/, '')
const apiBase = (process.env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/$/, '')

if (!token) {
  console.error('GITHUB_TOKEN (or GH_TOKEN) required')
  process.exit(1)
}

/** @param {string} pathOrUrl */
function apiUrl(pathOrUrl) {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl
  return `${apiBase}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`
}

/** @param {string} url */
async function ghJson(url) {
  const res = await fetch(apiUrl(url), {
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
  const res = await fetch(apiUrl(url), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status} download ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

/**
 * @typedef {{
 *   schemaVersion: 1
 *   updatedAt: string
 *   latestRelease: ReturnType<typeof buildLatestRelease>
 *   runs: Array<{
 *     runId: string
 *     timestamp: string
 *     commit: string
 *     sbom?: { artifactUrl?: string; artifactName?: string; format?: string }
 *     signing?: { signed?: boolean; imageDigest?: string | null }
 *   }>
 * }} SecurityStatusHistory
 */

/** @returns {SecurityStatusHistory} */
function loadHistory() {
  if (!existsSync(historyPath)) {
    return {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      latestRelease: buildLatestRelease(null),
      runs: [],
    }
  }
  return JSON.parse(readFileSync(historyPath, 'utf8'))
}

/** @param {SecurityStatusHistory['runs'][number] | null} newest */
function buildLatestRelease(newest) {
  let version = '8.0.0'
  try {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
    if (pkg.version) version = pkg.version
  } catch {
    /* default */
  }

  const digest = newest?.signing?.imageDigest ?? null
  const repository = 'ghcr.io/danielsmithdevelopment/clawql-mcp'
  const cosignTarget = digest
    ? `${repository}@${digest.startsWith('sha256:') ? digest : `sha256:${digest}`}`
    : `${repository}@sha256:<digest>`

  return {
    version,
    published: newest?.timestamp ? newest.timestamp.slice(0, 10) : null,
    commit: newest?.commit ?? null,
    sbomFormat: newest?.sbom?.format ?? 'cyclonedx-json',
    sbomArtifactName: newest?.sbom?.artifactName ?? 'sbom-cyclonedx-repository',
    sbomArtifactUrl:
      newest?.sbom?.artifactUrl ??
      (newest?.runId
        ? `${htmlServerUrl}/${repo}/actions/runs/${newest.runId}#artifacts`
        : null),
    image: {
      repository,
      digest,
      cosignVerifyCommand: `cosign verify ${cosignTarget} \\
  --certificate-identity-regexp 'https://github\\.com/danielsmithdevelopment/ClawQL/.*' \\
  --certificate-oidc-issuer-regexp 'https://token\\.actions\\.githubusercontent\\.com.*'`,
    },
  }
}

/** @param {number} workflowRunId @param {string} destDir */
async function downloadSecurityRecord(workflowRunId, destDir) {
  const artifacts = await ghJson(
    `/repos/${repo}/actions/runs/${workflowRunId}/artifacts?per_page=100`,
  )
  const list = /** @type {{ artifacts?: Array<{ id: number; name: string; expired: boolean }> }} */ (
    artifacts
  ).artifacts
  const hit = list?.find((a) => a.name === 'security-scan-run-record' && !a.expired)
  if (!hit) return null

  const zip = await ghBuffer(`/repos/${repo}/actions/artifacts/${hit.id}/zip`)
  const zipPath = join(destDir, 'artifact.zip')
  writeFileSync(zipPath, zip)
  execFileSync('unzip', ['-o', '-q', zipPath, '-d', destDir])
  const recordPath = join(destDir, 'security-scan-run-record.json')
  if (!existsSync(recordPath)) return null
  return JSON.parse(readFileSync(recordPath, 'utf8'))
}

async function main() {
  const history = loadHistory()
  const known = new Set(history.runs.map((r) => r.runId))

  const workflows = await ghJson(`/repos/${repo}/actions/workflows?per_page=100`)
  const ci = /** @type {{ workflows?: Array<{ id: number; path: string }> }} */ (workflows).workflows?.find(
    (w) => w.path === '.github/workflows/ci.yml',
  )
  if (!ci) {
    console.error('CI workflow not found')
    process.exit(1)
  }

  const runsResp = await ghJson(
    `/repos/${repo}/actions/workflows/${ci.id}/runs?branch=main&status=completed&per_page=50`,
  )
  const runs = /** @type {{ workflow_runs?: Array<{ id: number; head_branch: string }> }} */ (
    runsResp
  ).workflow_runs?.filter((r) => r.head_branch === 'main')

  if (!runs?.length) {
    console.log('No completed main CI runs found')
    history.latestRelease = buildLatestRelease(history.runs[0] ?? null)
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
  history.latestRelease = buildLatestRelease(history.runs[0] ?? null)
  history.updatedAt = new Date().toISOString()

  mkdirSync(resolve(historyPath, '..'), { recursive: true })
  writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`)
  console.log(`[security-status] wrote ${history.runs.length} runs to ${historyPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
