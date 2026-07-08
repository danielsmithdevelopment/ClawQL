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
    slug: 'openclaw-memory-recall',
    title: 'OpenClaw recalls a Cursor roadmap',
    source: 'OpenClaw + memory_recall case study (June 2026)',
    href: 'https://docs.clawql.com/case-studies/openclaw-clawql-memory-recall-2026-06',
    steps: [
      {
        kind: 'agent',
        title: 'Months earlier — different agent, different product',
        body: 'In Cursor, memory_ingest writes roadmap priorities, vendor analysis, and K8s debugging notes to the vault. OpenClaw is not installed yet.',
      },
      {
        kind: 'agent',
        title: 'Fresh OpenClaw thread — zero pasted history',
        body: 'A new gateway agent comes online: “fresh slate, no memories.” Different product, different session, no chat scrollback from April.',
      },
      {
        kind: 'tool',
        tool: 'memory_recall',
        title: 'Recall over Streamable HTTP',
        body: 'User directs clawql__memory_recall with query “comprehensive project summary”, limit 5 — return vault JSON paths and snippets only, no guessing.',
      },
      {
        kind: 'result',
        title: 'Ranked notes from long-ago sessions',
        body: 'Vault returns Memory/_INDEX_ClawQL.md, openclaw-mac-mini-clawql-mcp-setup.md, and docker-desktop-kubernetes-mcp-kyverno-cosign-session.md — each with path, score, and snippet from the tool response.',
      },
      {
        kind: 'result',
        title: 'Portable institutional memory',
        body: 'Roadmap and runbook context written before OpenClaw existed surfaces in a new gateway chat — same CLAWQL_OBSIDIAN_VAULT_PATH, no copy-paste.',
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
