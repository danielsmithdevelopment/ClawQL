/**
 * Native MCP tool governance policy — every ClawQL-owned tool (not upstream
 * catalog execute) must declare how it participates in session IFC and
 * destructive parking.
 *
 * Security finding: tools that skip this policy bypass the same choke point
 * as `execute` (policy / data-flow / park). CI enumerates registered tools
 * against this table.
 */

export type NativeToolKind = "passthrough" | "read" | "write" | "destructive";

export type NativeToolPolicy = {
  readonly kind: NativeToolKind;
  /** IFC / risk sink label (source:<label>). */
  readonly specLabel: string;
  readonly notes?: string;
};

/**
 * Tools whose handlers already invoke execute-core (or resume) for the
 * side-effecting work. The wrap still runs proxy hooks; native park/IFC
 * here would double-gate — skip native gate body for these names.
 */
export const EXECUTE_PATH_TOOL_NAMES = new Set([
  "execute",
  "proxy_call",
  "submit_program_proposals",
  "resume",
  "webmcp_draft_execute",
]);

/**
 * Canonical native-tool policy table.
 * Unknown tools default to **destructive** (fail closed) until classified.
 */
export const NATIVE_TOOL_POLICY: Readonly<Record<string, NativeToolPolicy>> = {
  // Core discovery / meta (non-mutating)
  search: { kind: "passthrough", specLabel: "clawql-core", notes: "discovery" },
  cache: { kind: "passthrough", specLabel: "clawql-core", notes: "ephemeral scratch" },
  audit: { kind: "passthrough", specLabel: "clawql-core", notes: "audit list/append" },
  skills_list: { kind: "read", specLabel: "clawql-skills" },
  skills_get: { kind: "read", specLabel: "clawql-skills" },
  docs_search: { kind: "read", specLabel: "clawql-docs" },
  console_link: { kind: "passthrough", specLabel: "clawql-core" },
  sources_propose: {
    kind: "write",
    specLabel: "clawql-sources",
    notes: "has its own proposal park",
  },
  execute_program: {
    kind: "passthrough",
    specLabel: "clawql-program",
    notes: "nested execute; proposals deferred",
  },
  memory_sync: { kind: "write", specLabel: "clawql-memory" },

  // Memory — IFC still gates untrusted→vault; first-party clawql-* may flow in.
  // Kind is **write** (not destructive): agents must be able to persist lessons
  // after recall/settings/skills without a mandate park on every note.
  memory_ingest: {
    kind: "write",
    specLabel: "clawql-memory",
    notes: "vault write — session IFC; no mandate park",
  },
  memory_recall: { kind: "read", specLabel: "clawql-memory" },
  read_around: { kind: "read", specLabel: "clawql-memory" },

  // Automation
  schedule: { kind: "destructive", specLabel: "clawql-automation" },
  notify: { kind: "destructive", specLabel: "clawql-automation" },
  workflow: { kind: "destructive", specLabel: "clawql-automation" },
  argocd: { kind: "destructive", specLabel: "clawql-automation" },
  hitl_enqueue_label_studio: { kind: "write", specLabel: "clawql-automation" },

  // Documents / knowledge
  ingest_external_knowledge: {
    kind: "destructive",
    specLabel: "untrusted-external",
    notes: "untrusted ingest → high taint",
  },
  knowledge_search_onyx: { kind: "read", specLabel: "onyx" },
  run_idp_pipeline: { kind: "write", specLabel: "clawql-documents" },
  inspect_pdf: { kind: "read", specLabel: "clawql-documents" },
  convert_document: { kind: "write", specLabel: "clawql-documents" },
  classify_document: { kind: "read", specLabel: "clawql-documents" },
  extract_document: { kind: "read", specLabel: "clawql-documents" },

  // Data / sandbox / web
  data_query: { kind: "read", specLabel: "clawql-data" },
  clawql_sql: { kind: "read", specLabel: "clawql-data" },
  data_ingest: { kind: "destructive", specLabel: "clawql-data" },
  data_status: { kind: "read", specLabel: "clawql-data" },
  sandbox_exec: { kind: "destructive", specLabel: "clawql-sandbox" },
  web_search: { kind: "read", specLabel: "untrusted-web" },
  web_fetch: { kind: "read", specLabel: "untrusted-web" },
  web_screenshot: { kind: "read", specLabel: "untrusted-web" },
  web_interact: { kind: "destructive", specLabel: "untrusted-web" },

  // Ontology
  get_matter: { kind: "read", specLabel: "clawql-ontology" },
  search_matters: { kind: "read", specLabel: "clawql-ontology" },
  list_matters: { kind: "read", specLabel: "clawql-ontology" },
  update_contract_status: { kind: "write", specLabel: "clawql-ontology" },
  adjust_contract_value: { kind: "destructive", specLabel: "clawql-ontology" },

  // Observability
  observability_query_logs: { kind: "read", specLabel: "clawql-observability" },
  observability_query_metrics: { kind: "read", specLabel: "clawql-observability" },
  observability_query_traces: { kind: "read", specLabel: "clawql-observability" },
  observability_health: { kind: "read", specLabel: "clawql-observability" },
  observability_alerts: { kind: "read", specLabel: "clawql-observability" },
  observability_apply_alloy_config: {
    kind: "destructive",
    specLabel: "clawql-observability",
  },

  // Harness / ouroboros
  clawql_think: { kind: "passthrough", specLabel: "clawql-harness" },
  ouroboros_create_seed_from_document: {
    kind: "write",
    specLabel: "clawql-ouroboros",
  },
  ouroboros_run_evolutionary_loop: {
    kind: "destructive",
    specLabel: "clawql-ouroboros",
  },
  ouroboros_get_lineage_status: { kind: "read", specLabel: "clawql-ouroboros" },
  ouroboros_measure_drift: { kind: "read", specLabel: "clawql-ouroboros" },
  ouroboros_propose_seed_revision_from_eval: {
    kind: "write",
    specLabel: "clawql-ouroboros",
  },

  // Network
  network_list_mesh_peers: { kind: "read", specLabel: "clawql-network" },
  network_register_gateway: { kind: "destructive", specLabel: "clawql-network" },
  network_gateway_heartbeat: { kind: "write", specLabel: "clawql-network" },

  // WebMCP draft
  webmcp_draft: { kind: "write", specLabel: "clawql-webmcp" },
  webmcp_draft_review: { kind: "read", specLabel: "clawql-webmcp" },
  webmcp_draft_publish: { kind: "destructive", specLabel: "clawql-webmcp" },
  webmcp_draft_rollback: { kind: "destructive", specLabel: "clawql-webmcp" },

  // ChatGPT extensions (must still go through wrap)
  clawql_settings_read: { kind: "read", specLabel: "clawql-chatgpt" },
  clawql_settings_update: { kind: "write", specLabel: "clawql-chatgpt" },
  clawql_mentions_search: { kind: "read", specLabel: "clawql-chatgpt" },
  clawql_evidence: { kind: "read", specLabel: "clawql-chatgpt" },
  clawql_console: { kind: "passthrough", specLabel: "clawql-chatgpt" },
  clawql_open_file: { kind: "read", specLabel: "clawql-chatgpt" },
};

/** Labels that count as untrusted for session taint after a successful read. */
export const UNTRUSTED_SPEC_LABELS = new Set([
  "untrusted-web",
  "untrusted-external",
  "untrusted-email",
  "untrusted-ticket",
  "untrusted-doc",
  "untrusted-webhook",
]);

export function resolveNativeToolPolicy(toolName: string): NativeToolPolicy {
  const known = NATIVE_TOOL_POLICY[toolName];
  if (known) return known;
  // Fail closed: unknown native tools are treated as destructive.
  return {
    kind: "destructive",
    specLabel: "clawql-unknown",
    notes: "unclassified native tool — default destructive",
  };
}

export function isExecutePathTool(toolName: string): boolean {
  return EXECUTE_PATH_TOOL_NAMES.has(toolName);
}

/** Marker exported for CI: every wrap must import this module. */
export const NATIVE_TOOL_GOVERNANCE_MODULE_ID = "clawql.native-tool-governance.v1" as const;
