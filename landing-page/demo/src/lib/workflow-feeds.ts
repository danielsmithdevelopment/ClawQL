/** Chronological MCP tool sequences from published case studies. */
export type WorkflowFeedStepKind = 'agent' | 'tool' | 'result'

export type WorkflowFeedStep = {
  kind: WorkflowFeedStepKind
  /** MCP tool name when kind is `tool`. */
  tool?: string
  title: string
  body: string
}

export type WorkflowFeed = {
  slug: string
  title: string
  source: string
  href: string
  steps: readonly WorkflowFeedStep[]
}

export const workflowFeeds: readonly WorkflowFeed[] = [
  {
    slug: 'cloudflare-docs',
    title: 'Ship docs.clawql.com',
    source: 'Cloudflare docs MCP case study',
    href: 'https://docs.clawql.com/case-studies/cloudflare-docs-mcp',
    steps: [
      {
        kind: 'agent',
        title: 'Agent intent',
        body: 'Deploy the Next.js docs site to docs.clawql.com on Cloudflare Workers and verify custom-domain routing.',
      },
      {
        kind: 'tool',
        tool: 'memory_recall',
        title: 'Recall prior context',
        body: 'Query the vault for “Cloudflare docs deploy”, Workers 1101, and OpenNext fs failures — skip dead ends from earlier sessions.',
      },
      {
        kind: 'tool',
        tool: 'search',
        title: 'Discover control-plane ops',
        body: 'Rank Cloudflare REST operations for Workers custom domains and zone bindings — no multi‑MB OpenAPI in the prompt.',
      },
      {
        kind: 'tool',
        tool: 'execute',
        title: 'Attach hostname',
        body: 'workers.domains.update — bind docs.clawql.com to the clawql-docs Worker with account_id, zone_id, and service name.',
      },
      {
        kind: 'result',
        title: 'Deploy and verify',
        body: 'OpenNext build via Wrangler; HTTP 200 on /; wrangler tail clean after fixing fs.readdir and MDX prerender crashes.',
      },
      {
        kind: 'tool',
        tool: 'memory_ingest',
        title: 'Persist runbook',
        body: 'Append deploy decisions and fixes to the vault with append: true and wikilinks — durable recall for the next incident.',
      },
    ],
  },
  {
    slug: 'github-provider',
    title: 'GitHub without a 9 MB spec dump',
    source: 'GitHub provider case study',
    href: 'https://docs.clawql.com/case-studies/github-provider-danielsmithdevelopment-clawql',
    steps: [
      {
        kind: 'agent',
        title: 'Agent intent',
        body: 'List the latest commits on main and update the repository description from the README summary.',
      },
      {
        kind: 'tool',
        tool: 'search',
        title: 'Find list-commits',
        body: '“GitHub REST list commits GET repos owner repo” → repos/list-commits ranked #2 among 1,099 indexed operations.',
      },
      {
        kind: 'tool',
        tool: 'execute',
        title: 'List commits',
        body: 'repos/list-commits with owner, repo, sha: main, per_page: 5 — lean JSON response, not the bundled ~9 MB spec.',
      },
      {
        kind: 'tool',
        tool: 'search',
        title: 'Find repos/update',
        body: '“PATCH update repository repos owner” → repos/update surfaces in the top hits.',
      },
      {
        kind: 'tool',
        tool: 'execute',
        title: 'Patch description',
        body: 'repos/update with validated args — description within GitHub’s 350-character limit.',
      },
      {
        kind: 'result',
        title: 'Measured token savings',
        body: 'Planning context drops from ~2.28M tokens (naive full-spec paste) to ~3.4K (search → execute workflow).',
      },
    ],
  },
  {
    slug: 'vault-github-session',
    title: 'Vault ingest → GitHub → audit',
    source: 'Vault memory + GitHub session case study',
    href: 'https://docs.clawql.com/case-studies/vault-memory-github-session-2026-04',
    steps: [
      {
        kind: 'tool',
        tool: 'memory_recall',
        title: 'Ground on prior work',
        body: 'Recall roadmap notes, vendor analysis, and open prioritization before triaging the backlog.',
      },
      {
        kind: 'tool',
        tool: 'memory_ingest',
        title: 'Capture decisions',
        body: 'Ingest structured insights with wikilinks — durable narrative, not ephemeral session cache.',
      },
      {
        kind: 'tool',
        tool: 'search',
        title: 'Find GitHub issue APIs',
        body: 'Discover issues/create and related operations from the bundled GitHub provider.',
      },
      {
        kind: 'tool',
        tool: 'execute',
        title: 'Open tracking issues',
        body: 'Create canonical GitHub issues for audit (#89), Helm wiring, and duplicate consolidation.',
      },
      {
        kind: 'tool',
        tool: 'audit',
        title: 'Log MCP events',
        body: 'Append structured breadcrumbs during the ship — correlate operator events with vault ingests later.',
      },
      {
        kind: 'tool',
        tool: 'memory_ingest',
        title: 'Close the loop',
        body: 'Append session outcomes so the next chat recalls what shipped and why.',
      },
    ],
  },
] as const
