/**
 * Single place to interpret optional feature flags (env → typed booleans).
 * See docs/mcp/mcp-tools.md and GitHub #79.
 */

import { z } from "zod";

/** `1`, `true`, `yes` (case-insensitive) → true; unset or other → false. */
function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

/** When `v` is unset, return `defaultWhenUnset`; otherwise same as `envTruthy`. */
function envTruthyWithDefault(v: string | undefined, defaultWhenUnset: boolean): boolean {
  if (v === undefined) return defaultWhenUnset;
  return envTruthy(v);
}

const rawOptionalFlagsSchema = z.object({
  ENABLE_GRPC: z.string().optional(),
  ENABLE_GRPC_REFLECTION: z.string().optional(),
  CLAWQL_EXTERNAL_INGEST: z.string().optional(),
  /** Default on: `memory_ingest` / `memory_recall`. Set `0` / `false` / `no` to unregister. */
  CLAWQL_ENABLE_MEMORY: z.string().optional(),
  /**
   * Default on: document pipeline — bundled tika / docling / gotenberg / paperless / stirling / onyx / **nextcloud** / **coneshare** in **`all-providers`**, plus
   * **`ingest_external_knowledge`** and (with **`CLAWQL_ENABLE_ONYX`**) **`knowledge_search_onyx`**. Set `0` to opt out.
   */
  CLAWQL_ENABLE_DOCUMENTS: z.string().optional(),
  CLAWQL_ENABLE_SCHEDULE: z.string().optional(),
  CLAWQL_ENABLE_NOTIFY: z.string().optional(),
  /** ([#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243)): Argo Workflows `workflow` MCP tool. Default false. */
  CLAWQL_ENABLE_WORKFLOW: z.string().optional(),
  /** ([#244](https://github.com/danielsmithdevelopment/ClawQL/issues/244)): Argo CD `argocd` MCP tool. Default false. */
  CLAWQL_ENABLE_ARGO_CD: z.string().optional(),
  CLAWQL_ENABLE_VISION: z.string().optional(),
  CLAWQL_ENABLE_ONYX: z.string().optional(),
  CLAWQL_ENABLE_OUROBOROS: z.string().optional(),
  CLAWQL_ENABLE_SANDBOX: z.string().optional(),
  /** Structural code graph MCP tools (`codegraph_*`). Default false — register with `CLAWQL_ENABLE_CODEGRAPH=1`. */
  CLAWQL_ENABLE_CODEGRAPH: z.string().optional(),
  /** Enterprise Ontology fixture MCP tools (`get_contract`, …). Default false — `CLAWQL_ENABLE_ONTOLOGY=1`. */
  CLAWQL_ENABLE_ONTOLOGY: z.string().optional(),
  /**
   * LOW/MEDIUM kinetic ontology write tools (`update_contract_status`, `adjust_contract_value`, …) via Transaction Sandbox.
   * Default false — requires `CLAWQL_ENABLE_ONTOLOGY=1` (or implies it when set).
   */
  CLAWQL_ENABLE_ONTOLOGY_WRITES: z.string().optional(),
  /**
   * Override entity search root for `clawql ontology lint|generate` (relative to cwd or absolute).
   * Default: `.clawql/ontology/entities` then `examples/ontology/entities`.
   */
  CLAWQL_ONTOLOGY_DIR: z.string().optional(),
  /** Optional JSON fixture path for ontology demo tools (`CLAWQL_ENABLE_ONTOLOGY`). */
  CLAWQL_ONTOLOGY_FIXTURE: z.string().optional(),
  /** Optional ATR scope list for kinetic writes (comma/space separated). Default permissive local `*`. */
  CLAWQL_ONTOLOGY_ATR_SCOPE: z.string().optional(),
  CLAWQL_ONTOLOGY_ATR_SUB: z.string().optional(),
  CLAWQL_ONTOLOGY_ATR_ROLE: z.string().optional(),
  /** ([#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228)): HITL Label Studio enqueue + webhook path. Default false. */
  CLAWQL_ENABLE_HITL_LABEL_STUDIO: z.string().optional(),
  /** ([#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254)): ConeShare webhook + IDP sharing integration. Default false. */
  CLAWQL_ENABLE_CONESHARE: z.string().optional(),
  /** ([#307](https://github.com/danielsmithdevelopment/ClawQL/issues/307)): `run_idp_pipeline` automated DEFAULT_IDP_PIPELINE executor. Default false. */
  CLAWQL_ENABLE_IDP_PIPELINE: z.string().optional(),
  /** ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248)): `classify_document` HTTP classifier wrapper. Default false. */
  CLAWQL_ENABLE_IDP_CLASSIFIER: z.string().optional(),
  /** ([#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)): `extract_document` LangExtract HTTP wrapper. Default false. */
  CLAWQL_ENABLE_LANGEXTRACT: z.string().optional(),
  /** ([#250](https://github.com/danielsmithdevelopment/ClawQL/issues/250)): Langfuse eval webhook + `ouroboros_propose_seed_revision_from_eval`. Default false. */
  CLAWQL_ENABLE_LANGFUSE_EVAL: z.string().optional(),
  /**
   * Bundled Google Cloud manifest (50 Discovery APIs). Default **false** — opt in with `1` / `true` / `yes`.
   * Adds GCP to the **default install stack**; explicit `CLAWQL_PROVIDER=google` or `CLAWQL_BUNDLED_PROVIDERS=google` still loads GCP.
   * Does **not** gate **`all-providers`** (that preset always includes Google).
   */
  CLAWQL_ENABLE_GOOGLE: z.string().optional(),
  /**
   * Omit Cloudflare from the **default install stack** when `0` / `false` / `no`. Default **true** when unset.
   * Does **not** gate **`all-providers`**. Explicit `CLAWQL_PROVIDER=cloudflare` or listing `cloudflare` in `CLAWQL_BUNDLED_PROVIDERS` still loads it.
   */
  CLAWQL_ENABLE_CLOUDFLARE: z.string().optional(),
  /**
   * Bundled AWS manifest (50 OpenAPI specs). Default **false** — opt in with `1` / `true` / `yes`.
   * Adds AWS to the **default install stack**; explicit `CLAWQL_PROVIDER=aws` or `CLAWQL_BUNDLED_PROVIDERS=aws` still loads AWS.
   * Does **not** gate **`all-providers`** (that preset always includes AWS).
   */
  CLAWQL_ENABLE_AWS: z.string().optional(),
});

export type ClawqlOptionalToolFlags = {
  /** `ENABLE_GRPC` — gRPC MCP on `GRPC_PORT` (default 50051). */
  enableGrpc: boolean;
  /** `ENABLE_GRPC_REFLECTION` — server reflection for grpcurl. */
  enableGrpcReflection: boolean;
  /** `CLAWQL_EXTERNAL_INGEST=1` — `ingest_external_knowledge` (Markdown import + optional URL fetch). */
  externalIngestPreview: boolean;
  /**
   * Durable **vault** tools **`memory_ingest`** / **`memory_recall`**. Default **true** (set **`CLAWQL_ENABLE_MEMORY=0`**
   * to hide tools). Still requires a writable `CLAWQL_OBSIDIAN_VAULT_PATH` to persist or recall.
   */
  enableMemory: boolean;
  /**
   * Document stack: default merge includes tika, gotenberg, paperless, stirling, onyx, nextcloud, coneshare; registers **`ingest_external_knowledge`**;
   * pairs with **`knowledge_search_onyx`** when **`CLAWQL_ENABLE_ONYX=1`**. Set **`CLAWQL_ENABLE_DOCUMENTS=0`** to opt out.
   */
  enableDocuments: boolean;
  /**
   * (#76): `schedule` tool — persisted jobs + manual synthetic trigger. Default false.
   */
  enableSchedule: boolean;
  /**
   * (#77): MCP `notify` tool (Slack `chat.postMessage`). Default false — register with `CLAWQL_ENABLE_NOTIFY=1`.
   */
  enableNotify: boolean;
  /**
   * ([#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243)): MCP `workflow` tool (Argo Workflows). Default false.
   */
  enableWorkflow: boolean;
  /**
   * ([#244](https://github.com/danielsmithdevelopment/ClawQL/issues/244)): MCP `argocd` tool (Argo CD Applications). Default false.
   */
  enableArgoCd: boolean;
  /**
   * Planned (#78): `vision` / `multimodal` tool. Default false until implemented.
   */
  enableVision: boolean;
  /**
   * ([#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118)): `knowledge_search_onyx` — wrapper over bundled Onyx search. Default false.
   */
  enableOnyxKnowledge: boolean;
  /**
   * ([#141](https://github.com/danielsmithdevelopment/ClawQL/issues/141)): Ouroboros MCP tools (`ouroboros_*`). Default false.
   */
  enableOuroboros: boolean;
  /**
   * ([#207](https://github.com/danielsmithdevelopment/ClawQL/issues/207)): MCP **`sandbox_exec`** (bridge / Seatbelt / Docker). Default false — register with **`CLAWQL_ENABLE_SANDBOX=1`**.
   */
  enableSandbox: boolean;
  /**
   * Structural code knowledge graph (`codegraph_*`) — Graphify-style AST indexing for TypeScript/JavaScript. Default false.
   */
  enableCodeGraph: boolean;
  /**
   * Enterprise Ontology read tools (fixture-backed `get_contract`, relationship traversals, …). Default false.
   */
  enableOntology: boolean;
  /**
   * LOW/MEDIUM kinetic ontology writes (`update_contract_status`, `adjust_contract_value`) via Transaction Sandbox. Default false.
   */
  enableOntologyWrites: boolean;
  /**
   * ([#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228)): **`hitl_enqueue_label_studio`** + **`POST /hitl/label-studio/webhook`**. Default false.
   */
  enableHitlLabelStudio: boolean;
  /**
   * ([#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254)): **`POST /idp/coneshare/webhook`** + bundled **coneshare** provider. Default false.
   */
  enableConeshare: boolean;
  /**
   * ([#307](https://github.com/danielsmithdevelopment/ClawQL/issues/307)): **`run_idp_pipeline`** — automated `DEFAULT_IDP_PIPELINE` executor. Default false.
   */
  enableIdpPipeline: boolean;
  /**
   * ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248)): **`classify_document`** — POST to `CLASSIFIER_BASE_URL` or local heuristic. Default false.
   */
  enableIdpClassifier: boolean;
  /**
   * ([#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)): **`extract_document`** — POST to `LANGEXTRACT_BASE_URL` or local heuristic. Default false.
   */
  enableLangextract: boolean;
  /**
   * ([#250](https://github.com/danielsmithdevelopment/ClawQL/issues/250)): **`POST /observability/langfuse/webhook`** + **`ouroboros_propose_seed_revision_from_eval`** (with Ouroboros). Default false.
   */
  enableLangfuseEval: boolean;
  /**
   * Adds Google Cloud to the **default install stack**. Default **false** (opt in).
   */
  enableGoogle: boolean;
  /**
   * Include Cloudflare in the **default install stack**. Default **true** (opt out with `0`).
   */
  enableCloudflare: boolean;
  /**
   * Adds AWS to the **default install stack**. Default **false** (opt in).
   */
  enableAws: boolean;
};

function rawToFlags(raw: z.infer<typeof rawOptionalFlagsSchema>): ClawqlOptionalToolFlags {
  return {
    enableGrpc: envTruthy(raw.ENABLE_GRPC),
    enableGrpcReflection: envTruthy(raw.ENABLE_GRPC_REFLECTION),
    externalIngestPreview: raw.CLAWQL_EXTERNAL_INGEST?.trim() === "1",
    enableMemory: envTruthyWithDefault(raw.CLAWQL_ENABLE_MEMORY, true),
    enableDocuments: envTruthyWithDefault(raw.CLAWQL_ENABLE_DOCUMENTS, true),
    enableSchedule: envTruthy(raw.CLAWQL_ENABLE_SCHEDULE),
    enableNotify: envTruthy(raw.CLAWQL_ENABLE_NOTIFY),
    enableWorkflow: envTruthy(raw.CLAWQL_ENABLE_WORKFLOW),
    enableArgoCd: envTruthy(raw.CLAWQL_ENABLE_ARGO_CD),
    enableVision: envTruthy(raw.CLAWQL_ENABLE_VISION),
    enableOnyxKnowledge: envTruthy(raw.CLAWQL_ENABLE_ONYX),
    enableOuroboros: envTruthy(raw.CLAWQL_ENABLE_OUROBOROS),
    enableSandbox: envTruthy(raw.CLAWQL_ENABLE_SANDBOX),
    enableCodeGraph: envTruthy(raw.CLAWQL_ENABLE_CODEGRAPH),
    enableOntology:
      envTruthy(raw.CLAWQL_ENABLE_ONTOLOGY) || envTruthy(raw.CLAWQL_ENABLE_ONTOLOGY_WRITES),
    enableOntologyWrites: envTruthy(raw.CLAWQL_ENABLE_ONTOLOGY_WRITES),
    enableHitlLabelStudio: envTruthy(raw.CLAWQL_ENABLE_HITL_LABEL_STUDIO),
    enableConeshare: envTruthy(raw.CLAWQL_ENABLE_CONESHARE),
    enableIdpPipeline: envTruthy(raw.CLAWQL_ENABLE_IDP_PIPELINE),
    enableIdpClassifier: envTruthy(raw.CLAWQL_ENABLE_IDP_CLASSIFIER),
    enableLangextract: envTruthy(raw.CLAWQL_ENABLE_LANGEXTRACT),
    enableLangfuseEval: envTruthy(raw.CLAWQL_ENABLE_LANGFUSE_EVAL),
    enableGoogle: envTruthy(raw.CLAWQL_ENABLE_GOOGLE),
    enableCloudflare: envTruthyWithDefault(raw.CLAWQL_ENABLE_CLOUDFLARE, true),
    enableAws: envTruthy(raw.CLAWQL_ENABLE_AWS),
  };
}

/**
 * Parsed optional tool flags from the given env (default `process.env`).
 */
export function getClawqlOptionalToolFlags(
  env: NodeJS.ProcessEnv = process.env
): ClawqlOptionalToolFlags {
  const raw = rawOptionalFlagsSchema.parse(env);
  return rawToFlags(raw);
}
