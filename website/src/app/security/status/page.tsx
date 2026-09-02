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
        This page shows raw, independently checkable supply-chain evidence — scan pass/fail history
        (including caught failures), SBOM artifact links, and signature verification commands. It is
        fed by CI exports and an append-only publish job, not hand-edited summaries. Spec:{' '}
        <a
          href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/design/security-status-page-spec.md"
          className="font-medium text-claw-graph underline decoration-claw-graph/40 underline-offset-2 dark:text-claw-cyan"
          rel="noopener noreferrer"
        >
          security-status-page-spec.md
        </a>
        .
      </p>

      <p className="not-prose mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        <Link href="/security" className="font-medium underline-offset-2 hover:underline">
          ← Security overview
        </Link>
        {' · '}
        <a
          href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/SECURITY.md"
          className="font-medium underline-offset-2 hover:underline"
          rel="noopener noreferrer"
        >
          SECURITY.md (disclosure)
        </a>
      </p>

      <section className="not-prose mt-10 border-t border-zinc-900/10 pt-10 dark:border-white/10">
        <h2 className="text-2xl font-semibold text-zinc-900 dark:text-white">Latest release</h2>
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
              <dd>{rel.commit.slice(0, 8)}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-zinc-500 dark:text-zinc-400">SBOM (Syft)</dt>
            <dd className="mt-1">
              CycloneDX JSON via CI artifact{' '}
              <code className="rounded bg-zinc-100 px-1 dark:bg-white/10">{rel.sbomArtifactName}</code>{' '}
              on each green supply-chain run — download from the linked CI run artifacts.
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500 dark:text-zinc-400">Verify signature</dt>
            <dd className="mt-1">
              <pre className="overflow-x-auto rounded-lg bg-zinc-100 p-3 text-xs dark:bg-white/10">
                {rel.image.cosignVerifyCommand}
              </pre>
            </dd>
          </div>
        </dl>
      </section>

      <section className="not-prose mt-10 border-t border-zinc-900/10 pt-10 dark:border-white/10">
        <h2 className="text-2xl font-semibold text-zinc-900 dark:text-white">Scan history</h2>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Last {data.runs.length || 0} published main-branch CI supply-chain runs. Failed rows are
          never removed — a fail-then-fix pair is evidence the gate blocked a merge.
        </p>
        {data.runs.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            No runs published yet. The scheduled{' '}
            <code className="rounded bg-zinc-100 px-1 dark:bg-white/10">
              security-status-publish
            </code>{' '}
            workflow will append records after CI exports land on <code className="font-mono">main</code>
            .
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-white/10">
                  <th className="py-2 pr-4 font-medium text-zinc-500">Run</th>
                  <th className="py-2 pr-4 font-medium text-zinc-500">Date</th>
                  <th className="py-2 pr-4 font-medium text-zinc-500">Commit</th>
                  <th className="py-2 pr-4 font-medium text-zinc-500">Trivy</th>
                  <th className="py-2 pr-4 font-medium text-zinc-500">OSV</th>
                  <th className="py-2 pr-4 font-medium text-zinc-500">Result</th>
                  <th className="py-2 font-medium text-zinc-500">CI log</th>
                </tr>
              </thead>
              <tbody>
                {data.runs.map((row) => (
                  <tr key={row.runId} className="border-b border-zinc-100 dark:border-white/5">
                    <td className="py-2 pr-4 font-mono">#{row.runId}</td>
                    <td className="py-2 pr-4">{formatDate(row.timestamp)}</td>
                    <td className="py-2 pr-4 font-mono">{row.commit.slice(0, 8)}</td>
                    <td className="py-2 pr-4 font-mono">{formatScannerCell('trivy', row)}</td>
                    <td className="py-2 pr-4 font-mono">{formatScannerCell('osv', row)}</td>
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
          Independent verification
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Third-party, vendor-neutral security benchmarks (for example MCPSEC-style formal properties)
          will be linked here when ClawQL completes a reproducible external evaluation — same
          independent-evidence principle as Harvey LAB and ExtractBench.
        </p>
      </section>
    </article>
  )
}
