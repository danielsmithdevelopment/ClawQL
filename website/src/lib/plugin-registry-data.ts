/**
 * Interactive plugin registry for /plugins.
 * Horizontal packages, MCP proxies, and domain verticals share one catalog —
 * verticals are domain-scoped plugins, not a separate product surface.
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
  shipped: 'Shipped',
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
      'beforeCallTool policy chokepoint for JWT ATR and enterprise MCP defense-in-depth.',
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
      'Durable Obsidian vault tools plus optional PageIndex and code graph registration.',
    category: 'horizontal',
    status: 'default-on',
    package: 'clawql-memory',
    tools: ['memory_ingest', 'memory_recall', 'pageindex_*', 'codegraph_*'],
    enable: 'CLAWQL_ENABLE_MEMORY=0 to omit',
    href: '/plugins/memory',
    keywords: ['vault', 'obsidian', 'pageindex'],
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
      'External ingest, optional Onyx search, and opt-in IDP / classifier / LangExtract tools.',
    category: 'horizontal',
    status: 'default-on',
    package: 'clawql-documents',
    tools: [
      'ingest_external_knowledge',
      'knowledge_search_onyx',
      'run_idp_pipeline',
      'classify_document',
      'extract_document',
    ],
    enable: 'CLAWQL_ENABLE_DOCUMENTS=0 to omit',
    href: '/plugins/documents',
    keywords: ['idp', 'onyx', 'ingest'],
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

  // Domain verticals — same Plugin.onRegister model; domain-scoped packages.
  {
    id: 'clawql-lending',
    name: 'Lending',
    description:
      'Mortgage, auto, BNPL, payday, and commercial LOS workflows — first planned production vertical.',
    category: 'vertical',
    status: 'planned',
    package: 'verticals/clawql-lending',
    enable: 'ClawQLInstance CRD / Operator tier flags',
    href: '/reference/verticals',
    keywords: ['mortgage', 'bnpl', 'underwriting', 'seethegreens'],
  },
  {
    id: 'clawql-blockchain',
    name: 'Blockchain',
    description:
      'Hyperledger Fabric, Base, Solana, Chainlink, The Graph, and agentic wallet surfaces.',
    category: 'vertical',
    status: 'planned',
    package: 'verticals/clawql-blockchain',
    enable: 'ClawQLInstance CRD / Operator tier flags',
    href: '/reference/verticals',
    keywords: ['fabric', 'solana', 'chainlink', 'wallet'],
  },
  {
    id: 'clawql-legal',
    name: 'Legal',
    description:
      'Contract intelligence, case law, e-discovery, privilege review, and drafting.',
    category: 'vertical',
    status: 'planned',
    package: 'verticals/clawql-legal',
    enable: 'ClawQLInstance CRD / Operator tier flags',
    href: '/reference/verticals',
    keywords: ['contracts', 'ediscovery', 'privilege'],
  },
  {
    id: 'clawql-healthcare',
    name: 'Healthcare',
    description:
      'FHIR/HL7, DICOM, EHR structuring, and HIPAA de-identification.',
    category: 'vertical',
    status: 'planned',
    package: 'verticals/clawql-healthcare',
    enable: 'ClawQLInstance CRD / Operator tier flags',
    href: '/reference/verticals',
    keywords: ['fhir', 'hipaa', 'ehr', 'dicom'],
  },
  {
    id: 'clawql-insurance',
    name: 'Insurance',
    description:
      'Claims, policy ingestion, underwriting automation, and fraud flagging.',
    category: 'vertical',
    status: 'planned',
    package: 'verticals/clawql-insurance',
    enable: 'ClawQLInstance CRD / Operator tier flags',
    href: '/reference/verticals',
    keywords: ['claims', 'policy', 'fraud'],
  },
  {
    id: 'clawql-supplychain',
    name: 'Supply chain',
    description:
      'Procurement-to-payment, logistics docs, ERP connectors, and trade compliance.',
    category: 'vertical',
    status: 'planned',
    package: 'verticals/clawql-supplychain',
    enable: 'ClawQLInstance CRD / Operator tier flags',
    href: '/reference/verticals',
    keywords: ['logistics', 'erp', 'procurement'],
  },
  {
    id: 'clawql-government',
    name: 'Government',
    description:
      'Permitting, FOIA, tax forms, procurement, and FedRAMP-ready defaults.',
    category: 'vertical',
    status: 'planned',
    package: 'verticals/clawql-government',
    enable: 'ClawQLInstance CRD / Operator tier flags',
    href: '/reference/verticals',
    keywords: ['foia', 'fedramp', 'permitting'],
  },
  {
    id: 'clawql-manufacturing',
    name: 'Manufacturing',
    description:
      'Production docs, QC, MES/ERP, BOM validation, and traceability.',
    category: 'vertical',
    status: 'planned',
    package: 'verticals/clawql-manufacturing',
    enable: 'ClawQLInstance CRD / Operator tier flags',
    href: '/reference/verticals',
    keywords: ['mes', 'bom', 'qc'],
  },
  {
    id: 'clawql-education',
    name: 'Education',
    description:
      'LMS connectors (Canvas/Moodle/Blackboard), content generation, adaptive learning.',
    category: 'vertical',
    status: 'planned',
    package: 'verticals/clawql-education',
    enable: 'ClawQLInstance CRD / Operator tier flags',
    href: '/reference/verticals',
    keywords: ['lms', 'canvas', 'moodle'],
  },
  {
    id: 'clawql-engineering',
    name: 'Engineering',
    description:
      'MATLAB MCP Core + Simulink Agentic Toolkit (requires licensed MATLAB on host).',
    category: 'vertical',
    status: 'planned',
    package: 'verticals/clawql-engineering',
    enable: 'ClawQLInstance CRD / Operator tier flags',
    href: '/reference/verticals',
    keywords: ['matlab', 'simulink'],
  },
]

export function entrySearchText(entry: PluginRegistryEntry): string {
  return [
    entry.id,
    entry.name,
    entry.description,
    entry.package,
    entry.enable,
    ...(entry.tools ?? []),
    ...(entry.keywords ?? []),
    PLUGIN_CATEGORY_LABELS[entry.category],
    PLUGIN_STATUS_LABELS[entry.status],
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}
