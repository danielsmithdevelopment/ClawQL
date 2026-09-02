/**
 * Interactive plugin registry for /plugins.
 * Horizontal packages = reusable capabilities.
 * Domain verticals = presets that compose horizontals + domain boilerplate
 * (e.g. tailored .cqw workflows) — not a separate product surface.
 */

export type PluginCategory =
  'core' | 'horizontal' | 'vertical' | 'proxy' | 'providers' | 'third-party'

export type PluginStatus =
  'always-on' | 'default-on' | 'opt-in' | 'shipped' | 'planned' | 'roadmap'

export type PluginRegistryEntry = {
  id: string
  name: string
  description: string
  category: PluginCategory
  status: PluginStatus
  package?: string
  tools?: string[]
  enable?: string
  href: string
  keywords?: string[]
  /** Horizontal plugins this vertical preset pulls in (vertical rows). */
  composes?: string[]
  /** Domain-tailored starters the vertical ships (e.g. .cqw packs). */
  boilerplate?: string
}

export const PLUGIN_CATEGORY_LABELS: Record<PluginCategory, string> = {
  core: 'Gateway core',
  horizontal: 'Horizontal',
  vertical: 'Domain vertical',
  proxy: 'MCP proxy',
  providers: 'Providers',
  'third-party': 'Third-party',
}

export const PLUGIN_STATUS_LABELS: Record<PluginStatus, string> = {
  'always-on': 'Always on',
  'default-on': 'Default on',
  'opt-in': 'Opt-in',
  shipped: 'Available',
  planned: 'Planned',
  roadmap: 'Roadmap',
}

/** Statuses that mean “available to run today” (including always/default/opt-in). */
export const SHIPPED_STATUSES: ReadonlySet<PluginStatus> = new Set([
  'always-on',
  'default-on',
  'opt-in',
  'shipped',
])

export const pluginRegistryEntries: PluginRegistryEntry[] = [
  {
    id: 'gateway-core',
    name: 'Gateway core',
    description:
      'search, execute, audit, and cache — always composed in clawql-api, not an optional plugin Layer.',
    category: 'core',
    status: 'always-on',
    package: 'clawql-api',
    tools: ['search', 'execute', 'audit', 'cache'],
    href: '/plugins/core',
    keywords: ['core', 'mcp'],
  },
  {
    id: 'panguard-mcp-proxy',
    name: 'Panguard MCP proxy',
    description:
      'Blocking tool/pre-execute hooks for JWT ATR and enterprise MCP defense-in-depth.',
    category: 'proxy',
    status: 'default-on',
    package: 'clawql-api (PanguardProxyPlugin)',
    enable: 'CLAWQL_PANGUARD_PROXY_PLUGIN=0 to omit',
    href: '/plugins/panguard-proxy',
    keywords: ['panguard', 'atr', 'security'],
  },
  {
    id: 'clawql-memory',
    name: 'Memory (vault)',
    description:
      'Building block: durable Obsidian vault tools plus optional PageIndex and code graph — composed into most domain vertical presets.',
    category: 'horizontal',
    status: 'default-on',
    package: 'clawql-memory',
    tools: ['memory_ingest', 'memory_recall', 'pageindex_*', 'codegraph_*'],
    enable: 'CLAWQL_ENABLE_MEMORY=0 to omit',
    href: '/plugins/memory',
    keywords: ['vault', 'obsidian', 'pageindex', 'building block', 'preset'],
  },
  {
    id: 'clawql-codegraph',
    name: 'Code graph',
    description:
      'Structural AST indexing and Graphify import via codegraph_* (registered by MemoryPlugin).',
    category: 'horizontal',
    status: 'opt-in',
    package: 'clawql-codegraph',
    tools: ['codegraph_*'],
    enable: 'CLAWQL_ENABLE_CODEGRAPH=1',
    href: '/plugins/codegraph',
    keywords: ['ast', 'graphify', 'hybrid recall'],
  },
  {
    id: 'clawql-documents',
    name: 'Documents & IDP',
    description:
      'Building block: external ingest, optional Onyx search, and IDP tools — composed into document-heavy vertical presets (lending, legal, healthcare, …).',
    category: 'horizontal',
    status: 'default-on',
    package: 'clawql-documents',
    tools: [
      'ingest_external_knowledge',
      'knowledge_search_onyx',
      'run_idp_pipeline',
      'convert_document',
      'classify_document',
      'inspect_pdf',
      'extract_document',
    ],
    enable: 'CLAWQL_ENABLE_DOCUMENTS=0 to omit',
    href: '/plugins/documents',
    keywords: [
      'idp',
      'onyx',
      'ingest',
      'building block',
      'preset',
      'anydoc',
      'pdf-inspector',
      'docling',
      'langextract',
    ],
  },
  {
    id: 'bundled-providers',
    name: 'Bundled providers',
    description:
      'Default OpenAPI/GraphQL spec merge stack — not an MCP plugin, but defines the install experience.',
    category: 'providers',
    status: 'default-on',
    package: 'providers/',
    href: '/plugins/bundled-providers',
    keywords: ['openapi', 'specs', 'cloudflare', 'github', 'slack'],
  },
  {
    id: 'clawql-automation',
    name: 'Automation',
    description:
      'schedule, notify, workflow, and argocd — each tool gated by its own enable flag.',
    category: 'horizontal',
    status: 'opt-in',
    package: 'clawql-automation',
    tools: ['schedule', 'notify', 'workflow', 'argocd'],
    enable: 'CLAWQL_ENABLE_SCHEDULE / NOTIFY / WORKFLOW / ARGO_CD',
    href: '/plugins/automation',
    keywords: ['slack', 'argo', 'cron'],
  },
  {
    id: 'clawql-sandbox',
    name: 'Sandbox',
    description:
      'sandbox_exec isolated snippets — Kata default in-cluster; Docker / Seatbelt / bridge fallbacks.',
    category: 'horizontal',
    status: 'opt-in',
    package: 'clawql-sandbox',
    tools: ['sandbox_exec'],
    enable: 'CLAWQL_ENABLE_SANDBOX=1',
    href: '/plugins/sandbox',
    keywords: ['kata', 'seatbelt', 'isolation'],
  },
  {
    id: 'clawql-data',
    name: 'Data',
    description:
      'Node DuckDB structured SQL — data_query / data_ingest. Not Python duckdb. Not chDB.',
    category: 'horizontal',
    status: 'opt-in',
    package: 'clawql-data',
    tools: ['data_query', 'data_ingest', 'data_status'],
    enable: 'CLAWQL_ENABLE_DATA=1',
    href: '/plugins/data',
    keywords: ['duckdb', 'sql', 'data_query'],
  },
  {
    id: 'clawql-network',
    name: 'Network',
    description:
      'Headscale standing mesh + Tailcat ephemeral transport, safe-by-default selector, ATR-gated tailcat audit.',
    category: 'horizontal',
    status: 'shipped',
    package: 'clawql-network',
    enable: 'clawql init --networking',
    href: '/specs/network/clawql-network',
    keywords: ['headscale', 'tailcat', 'mesh', 'tailscale', 'derp'],
  },
  {
    id: 'clawql-agents',
    name: 'Agents',
    description:
      'Hardened adapters for seven open-source agents — Panguard, WORM hooks, vault, Helm overlays.',
    category: 'horizontal',
    status: 'shipped',
    package: 'clawql-agents',
    href: '/agents/clawql-agents',
    keywords: ['openclaw', 'hermes', 'cline', 'openhands', 'goose', 'adapter'],
  },
  {
    id: 'clawql-audit',
    name: 'Audit (WORM)',
    description:
      'Durable tamper-evident WORM trail — distinct from in-process MCP audit ring in gateway core.',
    category: 'horizontal',
    status: 'shipped',
    package: 'clawql-audit',
    href: '/audit',
    keywords: ['worm', 'merkle', 'compliance', 'trail'],
  },
  {
    id: 'clawql-ouroboros',
    name: 'Ouroboros',
    description:
      'Evolutionary-loop MCP tools with optional Postgres lineage and Effect services.',
    category: 'horizontal',
    status: 'opt-in',
    package: 'clawql-ouroboros',
    tools: [
      'ouroboros_create_seed_from_document',
      'ouroboros_run_evolutionary_loop',
      'ouroboros_get_lineage_status',
    ],
    enable: 'CLAWQL_ENABLE_OUROBOROS=1',
    href: '/plugins/ouroboros',
    keywords: ['lineage', 'evolutionary'],
  },
  {
    id: 'clawql-inference-providers',
    name: 'Inference providers',
    description:
      'BYOK provider plugins for clawql-inference — direct vendor adapters; OpenRouter optional.',
    category: 'horizontal',
    status: 'shipped',
    package: 'clawql-inference/plugin',
    href: '/plugins/inference-providers',
    keywords: ['openai', 'anthropic', 'ollama', 'byok'],
  },
  {
    id: 'payments-x402-mcp-proxy',
    name: 'Payments',
    description:
      'Stripe + x402 + MPP + AP2 + ACP + PayPal + Adyen rails; PaymentsX402ProxyPlugin gates MCP tools.',
    category: 'proxy',
    status: 'shipped',
    package: 'clawql-payments',
    enable: 'CLAWQL_X402_ENFORCE=1 (and related rail flags)',
    href: '/plugins/payments',
    keywords: ['x402', 'stripe', 'mpp', 'billing'],
  },
  {
    id: 'clawql-hitl-label-studio',
    name: 'HITL (Label Studio)',
    description:
      'Human-in-the-loop enqueue + webhook path; full Plugin.onRegister wiring still planned.',
    category: 'horizontal',
    status: 'shipped',
    package: 'src/',
    tools: ['hitl_enqueue_label_studio'],
    enable: 'CLAWQL_ENABLE_HITL_LABEL_STUDIO=1',
    href: '/plugins/hitl-label-studio',
    keywords: ['hitl', 'label-studio', 'review'],
  },
  {
    id: 'third-party',
    name: 'Third-party plugins',
    description:
      'Roadmap for publishing clawql-*-plugin npm packages that depend on clawql-core + clawql-api.',
    category: 'third-party',
    status: 'roadmap',
    package: 'npm (clawql-*-plugin)',
    href: '/plugins/third-party',
    keywords: ['extension', 'npm', 'authors'],
  },

  // Domain verticals — presets: compose horizontals + domain .cqw boilerplate.
  {
    id: 'clawql-lending',
    name: 'Lending',
    description:
      'Preset for mortgage, auto, BNPL, payday, and commercial LOS — composes shared plugins, then adds underwriting tools and lending-shaped workflows.',
    category: 'vertical',
    status: 'planned',
    package: 'verticals/clawql-lending',
    enable: 'ClawQLInstance CRD / Operator tier flags',
    href: '/plugins?kind=vertical&q=lending#registry',
    composes: ['Memory', 'Documents', 'Automation'],
    boilerplate: 'LOS / underwriting .cqw starters (domain-tailored)',
    keywords: [
      'mortgage',
      'bnpl',
      'underwriting',
      'seethegreens',
      'preset',
      'cqw',
    ],
  },
  {
    id: 'clawql-surveillance',
    name: 'Surveillance',
    description:
      'Evidence integrity vertical — HSE attestation, Merkle/WORM audit, Arweave anchoring, case-number enforcement, and contract compliance reports for camera vendors.',
    category: 'vertical',
    status: 'planned',
    package: 'packages/clawql-surveillance',
    enable: 'CLAWQL_SURVEILLANCE_ENABLED=1',
    href: '/surveillance/clawql-surveillance',
    tools: [
      'footage_ingest',
      'footage_verify',
      'footage_query',
      'footage_export',
      'audit_log_query',
      'merkle_verify',
      'arweave_anchor_status',
      'accuracy_report_ingest',
      'accuracy_report_query',
      'agency_access_provision',
      'federal_access_log',
      'contract_compliance_report',
    ],
    composes: ['Memory', 'Automation'],
    boilerplate: 'Evidence integrity / FRE 901 chain-of-custody workflows',
    keywords: [
      'surveillance',
      'alpr',
      'footage',
      'attestation',
      'arweave',
      'merkle',
      'evidence',
      'fre901',
      'preset',
    ],
  },
  {
    id: 'clawql-blockchain',
    name: 'Blockchain',
    description:
      'Preset for Fabric, Base, Solana, Chainlink, The Graph, and agentic wallets — composes Memory (Documents optional) plus chain-specific tooling.',
    category: 'vertical',
    status: 'planned',
    package: 'verticals/clawql-blockchain',
    enable: 'ClawQLInstance CRD / Operator tier flags',
    href: '/plugins?kind=vertical&q=blockchain#registry',
    composes: ['Memory'],
    boilerplate: 'Settlement / wallet / consortium .cqw starters',
    keywords: ['fabric', 'solana', 'chainlink', 'wallet', 'preset', 'cqw'],
  },
  {
    id: 'clawql-legal',
    name: 'Legal',
    description:
      'Preset for contract intelligence, e-discovery, and privilege review — Memory + Documents with legal-shaped workflow packs.',
    category: 'vertical',
    status: 'planned',
    package: 'verticals/clawql-legal',
    enable: 'ClawQLInstance CRD / Operator tier flags',
    href: '/plugins?kind=vertical&q=legal#registry',
    composes: ['Memory', 'Documents'],
    boilerplate: 'Privilege / e-discovery / drafting .cqw starters',
    keywords: ['contracts', 'ediscovery', 'privilege', 'preset', 'cqw'],
  },
  {
    id: 'clawql-healthcare',
    name: 'Healthcare',
    description:
      'Preset for FHIR/HL7, DICOM, and EHR structuring — Memory + Documents with HIPAA-aware workflow boilerplate.',
    category: 'vertical',
    status: 'planned',
    package: 'verticals/clawql-healthcare',
    enable: 'ClawQLInstance CRD / Operator tier flags',
    href: '/plugins?kind=vertical&q=healthcare#registry',
    composes: ['Memory', 'Documents'],
    boilerplate: 'EHR ingest / de-id / clinical review .cqw starters',
    keywords: ['fhir', 'hipaa', 'ehr', 'dicom', 'preset', 'cqw'],
  },
  {
    id: 'clawql-insurance',
    name: 'Insurance',
    description:
      'Preset for claims, policy ingestion, and fraud flagging — composes Memory + Documents with claims-shaped .cqw packs.',
    category: 'vertical',
    status: 'planned',
    package: 'verticals/clawql-insurance',
    enable: 'ClawQLInstance CRD / Operator tier flags',
    href: '/plugins?kind=vertical&q=insurance#registry',
    composes: ['Memory', 'Documents', 'Automation'],
    boilerplate: 'Claims / FNOL / underwriting .cqw starters',
    keywords: ['claims', 'policy', 'fraud', 'preset', 'cqw'],
  },
  {
    id: 'clawql-supplychain',
    name: 'Supply chain',
    description:
      'Preset for procurement-to-payment and logistics docs — Memory + Documents with trade-compliance workflow starters.',
    category: 'vertical',
    status: 'planned',
    package: 'verticals/clawql-supplychain',
    enable: 'ClawQLInstance CRD / Operator tier flags',
    href: '/plugins?kind=vertical&q=supply#registry',
    composes: ['Memory', 'Documents', 'Automation'],
    boilerplate: 'P2P / logistics / trade-compliance .cqw starters',
    keywords: ['logistics', 'erp', 'procurement', 'preset', 'cqw'],
  },
  {
    id: 'clawql-government',
    name: 'Government',
    description:
      'Outcome accountability vertical — measurable bond/program definitions, Arweave-anchored baselines, Merkle/WORM audit, FOIA vault, auditor API, and nonprofit contractor monitoring.',
    category: 'vertical',
    status: 'planned',
    package: 'packages/clawql-government',
    enable: 'CLAWQL_GOVERNMENT_ENABLED=1',
    href: '/government/clawql-government',
    tools: [
      'program_create',
      'program_authorize',
      'outcome_define',
      'outcome_record',
      'outcome_compare',
      'outcome_report',
      'baseline_anchor',
      'baseline_verify',
      'document_ingest',
      'document_export_foia',
      'bond_validate',
      'bond_authorize',
      'spending_record',
      'auditor_export',
      'whistleblower_ingest',
    ],
    composes: ['Memory', 'Documents', 'Payments audit'],
    keywords: [
      'government',
      'bond',
      'outcome',
      'arweave',
      'foia',
      'auditor',
      'nonprofit',
    ],
  },
  {
    id: 'clawql-manufacturing',
    name: 'Manufacturing',
    description:
      'Preset for production docs, QC, and BOM validation — Memory + Documents with traceability workflow packs.',
    category: 'vertical',
    status: 'planned',
    package: 'verticals/clawql-manufacturing',
    enable: 'ClawQLInstance CRD / Operator tier flags',
    href: '/plugins?kind=vertical&q=manufacturing#registry',
    composes: ['Memory', 'Documents'],
    boilerplate: 'QC / BOM / traceability .cqw starters',
    keywords: ['mes', 'bom', 'qc', 'preset', 'cqw'],
  },
  {
    id: 'clawql-education',
    name: 'Education',
    description:
      'Preset for LMS connectors and adaptive learning — Memory + Documents with course-ops workflow starters.',
    category: 'vertical',
    status: 'planned',
    package: 'verticals/clawql-education',
    enable: 'ClawQLInstance CRD / Operator tier flags',
    href: '/plugins?kind=vertical&q=education#registry',
    composes: ['Memory', 'Documents'],
    boilerplate: 'LMS sync / content-gen .cqw starters',
    keywords: ['lms', 'canvas', 'moodle', 'preset', 'cqw'],
  },
  {
    id: 'clawql-engineering',
    name: 'Engineering',
    description:
      'Preset for MATLAB / Simulink agentic kits — Memory + Sandbox with engineering workflow boilerplate (licensed MATLAB host).',
    category: 'vertical',
    status: 'planned',
    package: 'verticals/clawql-engineering',
    enable: 'ClawQLInstance CRD / Operator tier flags',
    href: '/plugins?kind=vertical&q=engineering#registry',
    composes: ['Memory', 'Sandbox'],
    boilerplate: 'Model-run / Simulink review .cqw starters',
    keywords: ['matlab', 'simulink', 'preset', 'cqw'],
  },
]

export function entrySearchText(entry: PluginRegistryEntry): string {
  return [
    entry.id,
    entry.name,
    entry.description,
    entry.package,
    entry.enable,
    entry.boilerplate,
    ...(entry.tools ?? []),
    ...(entry.composes ?? []),
    ...(entry.keywords ?? []),
    PLUGIN_CATEGORY_LABELS[entry.category],
    PLUGIN_STATUS_LABELS[entry.status],
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}
