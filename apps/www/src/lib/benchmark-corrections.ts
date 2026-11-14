/**
 * Dated corrections / withdrawals for clawql.com/benchmarks.
 * Keep newest first. Prefer linking the replacing board when one exists.
 */

export type BenchmarkCorrection = {
  dated: string
  claim: string
  action: string
}

export const benchmarkCorrectionsHeadline = 'Corrections log'

export const benchmarkCorrectionsSummary =
  'Claims corrected or withdrawn on this page and related marketing surfaces. Credibility rule: publish the fix, not only the win.'

export const benchmarkCorrections: readonly BenchmarkCorrection[] = [
  {
    dated: '2026-11-12',
    claim: 'Durability header / deep links still cited ~12s failover as the current number',
    action:
      'Aligned with lab v4 identity remesure (~17s resume p50, 0 correctness @ N=1000). October stock-TTL ~12s board kept as history.',
  },
  {
    dated: '2026-11-12',
    claim: '“Most efficient governed MCP gateway” / category supremacy framing on the pets board',
    action:
      'Reworded to fewest tokens among measured gateways on this fixture with equal task success; category claim still waits on the dominance roadmap.',
  },
  {
    dated: '2026-11-12',
    claim: 'Executor “2.0.0 stable” / remasure-on-stable language',
    action:
      'Named the β channel explicitly (board β.15; tip β.37 as of 2026-11-05). npm latest remains 1.x. HTTP concurrency row labeled under review (#1480).',
  },
  {
    dated: '2026-11-12',
    claim: 'Feature matrix: Onyx named; “unlimited executions”; WORM implied default-on',
    action:
      'Semantic search engine under review; fair-use (not unlimited); hash-chained audit with Object Lock write-once when configured.',
  },
  {
    dated: '2026-11-12',
    claim: 'Dominance roadmap named Uber as a peer without equal-arm measurement',
    action: 'Renamed the row to published techniques (tool search, response projection, code mode).',
  },
  {
    dated: '2026-11-11',
    claim: 'Executor comparison table on /pricing; FedRAMP-ready wording on industry pages',
    action: 'Removed unsourced Executor pricing comparison; replaced FedRAMP-ready with self-hosted accredited-environment language.',
  },
  {
    dated: '2026-11-11',
    claim: 'Home /agents design (Streams, TEE, QR) described as shipping; MCP audit offered as examiner evidence',
    action:
      'Labeled design/planned; distinguished MCP audit ring buffer from hash-chained / Object Lock trail across marketing pages.',
  },
  {
    dated: '2026-10',
    claim: 'Governance lead from configured ClawQL deny vs peer defaults (vault-write)',
    action:
      'v2 fair columns: defaults tied at 2/5; best-config ClawQL 5/5 with peer denies invited. Deep-board blurbs must use that summary.',
  },
] as const
