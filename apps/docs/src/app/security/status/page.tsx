import Link from 'next/link'

import { Tag } from '@/components/Tag'
import {
  formatScannerCell,
  getSecurityStatusHistory,
} from '@/lib/security-scan-history'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Security status — verifiable scan history',
  description:
    'Append-only CI scan history (Trivy, OSV), SBOM artifact links, and Cosign verification commands — not self-reported badges.',
  path: '/security/status',
})

export const dynamic = 'force-static'

function formatDate(iso: string): string {
  try {
    return iso.slice(0, 10)
  } catch {
    return iso
  }
}

export default function SecurityStatusPage() {
  const data = getSecurityStatusHistory()
  const rel = data.latestRelease

  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="rose" variant="medium">
          Security
        </Tag>
        <Tag color="zinc" variant="medium">
          Verifiable
        </Tag>
      </div>

      <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-white">
        Security status
      </h1>
      <p className="mt-4 max-w-3xl text-lg text-zinc-600 dark:text-zinc-400">
        This page proves ClawQL&apos;s security process runs and holds. Every
        element is either raw, independently verifiable data (an SBOM, a
        signature command, a CI log) or a real history of scan outcomes —
        including failures that were caught and fixed — never a badge claiming a
        snapshot state. Spec:{' '}
        <a
          href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/design/security-status-page-spec.md"
          className="font-medium text-claw-graph underline decoration-claw-graph/40 underline-offset-2 dark:text-claw-cyan"
          rel="noopener noreferrer"
        >
          security-status-page-spec.md
        </a>
        .
      </p>
      <p className="mt-3 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
        This is not a live vulnerability dashboard. It never lists currently
        open, unpatched findings on unmerged branches — only historical gate
        outcomes after CI has already recorded them.
      </p>

      <p className="not-prose mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        <Link
          href="/security"
          className="font-medium underline-offset-2 hover:underline"
        >
          ← Security overview
        </Link>
      </p>

      <section className="not-prose mt-10 border-t border-zinc-900/10 pt-10 dark:border-white/10">
        <h2 className="text-2xl font-semibold text-zinc-900 dark:text-white">
          Latest release
        </h2>
        <dl className="mt-4 space-y-2 font-mono text-sm text-zinc-700 dark:text-zinc-300">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-zinc-500 dark:text-zinc-400">Version</dt>
            <dd>v{rel.version}</dd>
          </div>
          {rel.published ? (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-zinc-500 dark:text-zinc-400">Published</dt>
              <dd>{rel.published}</dd>
            </div>
          ) : null}
          {rel.commit ? (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-zinc-500 dark:text-zinc-400">Commit</dt>
              <dd>
                <a
                  href={`https://github.com/danielsmithdevelopment/ClawQL/commit/${rel.commit}`}
                  className="font-medium text-claw-graph underline-offset-2 hover:underline dark:text-claw-cyan"
                  rel="noopener noreferrer"
                >
                  {rel.commit.slice(0, 8)}
                </a>
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-zinc-500 dark:text-zinc-400">SBOM (Syft)</dt>
            <dd className="mt-1">
              {rel.sbomArtifactUrl ? (
                <>
                  <a
                    href={rel.sbomArtifactUrl}
                    className="font-medium text-claw-graph underline decoration-claw-graph/40 underline-offset-2 dark:text-claw-cyan"
                    rel="noopener noreferrer"
                  >
                    Download SBOM — {rel.sbomFormat}
                  </a>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {' '}
                    (CI artifact{' '}
                    <code className="rounded bg-zinc-100 px-1 dark:bg-white/10">
                      {rel.sbomArtifactName}
                    </code>
                    )
                  </span>
                </>
              ) : (
                <>
                  CycloneDX JSON via CI artifact{' '}
                  <code className="rounded bg-zinc-100 px-1 dark:bg-white/10">
                    {rel.sbomArtifactName}
                  </code>{' '}
                  on each green supply-chain run — download from the linked CI
                  run artifacts once history is published.
                </>
              )}
            </dd>
          </div>
          {rel.image.digest ? (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-zinc-500 dark:text-zinc-400">
                Signed image digest
              </dt>
              <dd className="break-all">{rel.image.digest}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-zinc-500 dark:text-zinc-400">
              Verify signature
            </dt>
            <dd className="mt-1">
              <pre className="overflow-x-auto rounded-lg bg-zinc-100 p-3 text-xs dark:bg-white/10">
                {rel.image.cosignVerifyCommand}
              </pre>
              {!rel.image.digest ? (
                <p className="mt-2 font-sans text-xs text-zinc-500 dark:text-zinc-400">
                  Digest fills in when a signed image record is published from
                  the container release pipeline. Until then, substitute the{' '}
                  <code className="rounded bg-zinc-100 px-1 dark:bg-white/10">
                    sha256:&lt;digest&gt;
                  </code>{' '}
                  from the GHCR package page.
                </p>
              ) : null}
            </dd>
          </div>
        </dl>
      </section>

      <section className="not-prose mt-10 border-t border-zinc-900/10 pt-10 dark:border-white/10">
        <h2 className="text-2xl font-semibold text-zinc-900 dark:text-white">
          Scan history
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Last {data.runs.length || 0} published main-branch CI supply-chain
          runs (capped at 30). Failed rows are never removed — a fail-then-fix
          pair is evidence the gate blocked a merge. Sourced from CI export
          artifacts, not hand-curated.
        </p>
        {data.runs.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            No runs published yet. The scheduled{' '}
            <code className="rounded bg-zinc-100 px-1 dark:bg-white/10">
              security-status-publish
            </code>{' '}
            workflow appends records after CI exports land on{' '}
            <code className="font-mono">main</code>.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-white/10">
                  <th className="py-2 pr-4 font-medium text-zinc-500">Run</th>
                  <th className="py-2 pr-4 font-medium text-zinc-500">Date</th>
                  <th className="py-2 pr-4 font-medium text-zinc-500">
                    Commit
                  </th>
                  <th className="py-2 pr-4 font-medium text-zinc-500">Trivy</th>
                  <th className="py-2 pr-4 font-medium text-zinc-500">OSV</th>
                  <th className="py-2 pr-4 font-medium text-zinc-500">
                    Result
                  </th>
                  <th className="py-2 font-medium text-zinc-500">CI log</th>
                </tr>
              </thead>
              <tbody>
                {data.runs.map((row) => (
                  <tr
                    key={row.runId}
                    className="border-b border-zinc-100 dark:border-white/5"
                  >
                    <td className="py-2 pr-4 font-mono">#{row.runId}</td>
                    <td className="py-2 pr-4">{formatDate(row.timestamp)}</td>
                    <td className="py-2 pr-4 font-mono">
                      {row.commit.slice(0, 8)}
                    </td>
                    <td className="py-2 pr-4 font-mono">
                      {formatScannerCell('trivy', row)}
                    </td>
                    <td className="py-2 pr-4 font-mono">
                      {formatScannerCell('osv', row)}
                    </td>
                    <td className="py-2 pr-4">{row.overallResult}</td>
                    <td className="py-2">
                      <a
                        href={row.ciRunUrl}
                        className="font-medium text-claw-graph underline-offset-2 hover:underline dark:text-claw-cyan"
                        rel="noopener noreferrer"
                      >
                        link
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
          History updated: {data.updatedAt}
        </p>
      </section>

      <section className="not-prose mt-10 border-t border-zinc-900/10 pt-10 dark:border-white/10">
        <h2 className="text-2xl font-semibold text-zinc-900 dark:text-white">
          Security policy
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Disclosure process and response-time commitments live in{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/SECURITY.md"
            className="font-medium text-claw-graph underline decoration-claw-graph/40 underline-offset-2 dark:text-claw-cyan"
            rel="noopener noreferrer"
          >
            SECURITY.md
          </a>
          . Report vulnerabilities to{' '}
          <a
            href="mailto:daniel@clawql.com"
            className="font-medium underline-offset-2 hover:underline"
          >
            daniel@clawql.com
          </a>
          — do not open public issues for undisclosed findings.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full max-w-md border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-white/10">
                <th className="py-2 pr-4 font-medium text-zinc-500">
                  Severity
                </th>
                <th className="py-2 font-medium text-zinc-500">
                  Target first response
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-zinc-100 dark:border-white/5">
                <td className="py-2 pr-4">Critical</td>
                <td className="py-2">48 hours</td>
              </tr>
              <tr className="border-b border-zinc-100 dark:border-white/5">
                <td className="py-2 pr-4">High</td>
                <td className="py-2">5 business days</td>
              </tr>
              <tr className="border-b border-zinc-100 dark:border-white/5">
                <td className="py-2 pr-4">Other</td>
                <td className="py-2">10 business days</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="not-prose mt-10 border-t border-zinc-900/10 pt-10 dark:border-white/10">
        <h2 className="text-2xl font-semibold text-zinc-900 dark:text-white">
          Independent verification
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Third-party, vendor-neutral security benchmarks (for example
          MCPSEC-style formal properties) will be linked here when ClawQL
          completes a reproducible external evaluation — same
          independent-evidence principle as Harvey LAB and ExtractBench. This
          page does not make comparative &quot;most secure gateway&quot; claims.
        </p>
      </section>
    </article>
  )
}
