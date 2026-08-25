export const caseStudies = [
  {
    slug: 'github-provider',
    title: 'GitHub without pasting 9 MB of OpenAPI',
    outcome: '~2.28M planning tokens → ~3.4K',
    summary:
      'Agents search 1,099 indexed GitHub operations by intent, then execute list-commits and repos/update — the spec stays in the MCP server, not the chat.',
    href: 'https://docs.clawql.com/case-studies/github-provider-danielsmithdevelopment-clawql',
  },
  {
    slug: 'cloudflare-docs',
    title: 'Ship docs.clawql.com via MCP',
    outcome: 'Control plane + Worker-safe app',
    summary:
      'Deploy Cloudflare Workers with search/execute for zones and domains — then fix OpenNext fs/runtime issues until docs.clawql.com is reliable.',
    href: 'https://docs.clawql.com/case-studies/cloudflare-docs-mcp',
  },
  {
    slug: 'openclaw-memory',
    title: 'OpenClaw recalls prior sessions',
    outcome: 'Cross-session vault recall',
    summary:
      'A fresh OpenClaw agent thread calls memory_recall and returns ranked vault notes from earlier Cursor and K8s work — no copy-paste.',
    href: 'https://docs.clawql.com/case-studies/openclaw-clawql-memory-recall-2026-06',
  },
  {
    slug: 'vault-github',
    title: 'Ingest → prioritize → ship audit',
    outcome: 'Vault + GitHub execution loop',
    summary:
      'memory_ingest captures roadmap and vendor analysis; GitHub issues track work; the audit tool ships as the first enterprise vertical slice.',
    href: 'https://docs.clawql.com/case-studies/vault-memory-github-session-2026-04',
  },
  {
    slug: 'worker-1102',
    title: 'Debug a production Worker incident',
    outcome: 'MCP + memory_ingest postmortem',
    summary:
      'When docs.clawql.com hit Cloudflare Error 1102, agents used search/execute against the Cloudflare API and ingested incident notes into the vault.',
    href: 'https://docs.clawql.com/case-studies/docs-clawql-worker-1102-mcp-memory-2026-04',
  },
  {
    slug: 'homelab',
    title: 'Homelab networking with vault memory',
    outcome: 'errno 49 → documented fix',
    summary:
      'TrueNAS Scale + Mac mini K8s debugging persisted via memory_ingest — recall surfaces SSH and routing fixes in the next session.',
    href: 'https://docs.clawql.com/case-studies/truenas-scale-corgicave-homelab',
  },
] as const

export const mcpToolTiers = {
  core: {
    label: 'ClawQL Core',
    tagline: 'Always on — no opt-out',
    tools: [
      {
        name: 'search',
        help: 'Rank thousands of API operations by natural-language intent. Specs stay server-side; agents get operation IDs and parameter hints.',
      },
      {
        name: 'execute',
        help: 'Run one operation with validated args over REST, GraphQL, or gRPC. Lean responses keep tool results out of your context budget.',
      },
      {
        name: 'audit',
        help: 'In-process ring buffer of structured events — append, list, clear. Pair with memory_ingest when you need a durable operator trail.',
      },
      {
        name: 'cache',
        help: 'Ephemeral LRU scratch space for the active session. Use memory_* when data must survive restarts.',
      },
    ],
  },
  memory: {
    label: 'Memory & knowledge',
    tagline: 'Default on — opt out with CLAWQL_ENABLE_MEMORY=0',
    tools: [
      {
        name: 'memory_ingest',
        help: 'Write Obsidian Markdown with wikilinks and structured insights. Decisions, runbooks, and postmortems persist across chat sessions.',
      },
      {
        name: 'memory_recall',
        help: 'Keyword search, wikilink graph hops, optional vector KNN. Agents pull institutional knowledge rather than re-asking the same questions.',
      },
      {
        name: 'ingest_external_knowledge',
        help: 'Bulk Markdown or HTTPS URLs into the vault — ideal for importing docs, threads, and vendor analyses.',
      },
      {
        name: 'knowledge_search_onyx',
        help: 'Hybrid enterprise search over your Onyx index. Ground agent answers in indexed documents.',
      },
    ],
  },
  automation: {
    label: 'Automation & ops',
    tagline: 'Opt in via CLAWQL_ENABLE_* flags',
    tools: [
      {
        name: 'schedule',
        help: 'Persisted synthetic HTTP checks with assertion-based pass/fail and run history — uptime without a separate monitoring stack.',
      },
      {
        name: 'notify',
        help: 'Slack chat.postMessage wrapper for workflow milestones. Pipe IDP completion summaries straight to your team channel.',
      },
      {
        name: 'sandbox_exec',
        help: 'Isolated code snippets via Seatbelt, Docker, or Kata — validate transforms without giving agents a raw shell.',
      },
      {
        name: 'workflow / argocd',
        help: 'Submit Argo Workflows and observe Argo CD Applications from the same MCP surface your agents already use.',
      },
    ],
  },
  idp: {
    label: 'IDP document pipeline',
    tagline: 'pdf-inspector route, eight vendors, grounded extract',
    tools: [
      {
        name: 'inspect_pdf',
        help: 'Firecrawl pdf-inspector — classify TextBased vs scanned, extract Markdown, and decide whether Docling OCR is needed.',
      },
      {
        name: 'run_idp_pipeline',
        help: 'Automated multi-hop pipeline: Nextcloud intake → Docling/Tika → Gotenberg → Stirling → archive → Onyx → Coneshare VDR.',
      },
      {
        name: 'classify_document',
        help: 'Route documents by type before extraction — W-2s, invoices, and contracts hit the right downstream handlers.',
      },
      {
        name: 'extract_document',
        help: 'Schema-grounded LangExtract fields with char_interval provenance — grounded extraction with measurable confidence.',
      },
      {
        name: 'hitl_enqueue_label_studio',
        help: 'Push low-confidence extractions to Label Studio for human review, then ingest decisions back into the vault.',
      },
    ],
  },
} as const

export const idpPipelineStages = [
  {
    vendor: 'Nextcloud',
    role: 'Intake & sync',
    detail: 'WebDAV inbox receives uploads; processed files sync back to team folders.',
  },
  {
    vendor: 'pdf-inspector',
    role: 'PDF route',
    detail: 'Local classify + Markdown for text PDFs; route scanned/mixed pages to Docling OCR.',
  },
  {
    vendor: 'Docling / Tika',
    role: 'Parse & extract',
    detail: 'Layout-aware OCR for forms and W-2s; Tika handles 1,000+ text formats.',
  },
  {
    vendor: 'Gotenberg',
    role: 'Normalize to PDF',
    detail: 'Office and HTML sources become consistent PDFs for downstream redaction.',
  },
  {
    vendor: 'Stirling',
    role: 'Redact & fix',
    detail: 'PII redaction, split, and merge before documents enter the archive.',
  },
  {
    vendor: 'ClawQL Archive Layer',
    role: 'Managed archive',
    detail:
      'Nextcloud + Postgres metadata store, Onyx-indexed — the default on managed accounts. Paperless-ngx compatible for self-hosted deployments.',
  },
  {
    vendor: 'Onyx',
    role: 'Enterprise search',
    detail: 'Hybrid search and ingestion API — agents query indexed content via knowledge_search_onyx.',
  },
  {
    vendor: 'Coneshare',
    role: 'Secure sharing',
    detail: 'VDR share links and viewer webhooks for external parties who need controlled access.',
  },
] as const

/** Multi-provider token benchmark: docs/benchmarks/multi-provider-complex-workflow */
export const multiProviderBenchmark = {
  providers: 'Google Cloud, Cloudflare, and Jira',
  indexedOperations: '7,174',
  workflowOperations: '62',
  planningTokensBefore: '~10.2M',
  planningTokensAfter: '~12K',
  percentReduction: '99.9%',
  compressionRatio: '~862×',
  href: 'https://docs.clawql.com/benchmarks',
  workflowHref: 'https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/workflows/workflow-multi-provider.md',
} as const

/** Homepage hero proof chips — compact credibility under the CTA. */
export const homepageProofChips = [
  'Apache 2.0 core',
  'Event-driven, not prompt-driven',
  'OpenBench mini-firm proven',
  'TEE-ready from day one',
] as const

/**
 * OpenBench mini-firm B-7.1 — structured ontology recall vs keyword/semantic.
 * Run: https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31255172649
 */
export const openBenchMiniFirm = {
  runId: '31255172649',
  runUrl: 'https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31255172649',
  essayUrl: 'https://pragmaticvectors.com/posts/memory-finds-ontology-decides/',
  caption: 'OpenBench mini-firm (B-7.1) — same notes, same model, different retrieval mechanism.',
  rows: [
    { arm: 'ClawQL on', score: '3/3 (1.0)', found: '5/5', path: 'structured_predicate' },
    { arm: 'ClawQL off', score: '0/3', found: '0/5', path: 'could not complete' },
    { arm: 'No memory', score: '0/3', found: '0/5', path: 'could not complete' },
  ],
} as const

/** Protocol Fabric surface lists — shipped + planned, kept honest for homepage. */
export const protocolFabricSurfaces = {
  inbound: 'REST · GraphQL · gRPC · WebSocket · MCP · generated CLI · QR stream',
  outbound: 'OpenAPI · GraphQL · Streamable HTTP · gRPC · gen-cli · WebSocket · QR · /mcp-ui',
  docsHref: 'https://docs.clawql.com/mcp/protocol-fabric',
  adapterHref: 'https://docs.clawql.com/mcp/mcp-api-adapter',
} as const

export const clawqlTeeSummary = {
  href: 'https://docs.clawql.com/streams/clawql-tee',
  body: 'For regulated environments where the operator itself cannot be trusted: clawql-tee is a DO-compatible runtime with AMD SEV-SNP, Intel TDX, and AWS Nitro Enclaves. Hardware attestation gates secrets; the audit trail can leave via QR optical channel — no network path across the boundary.',
} as const
