/**
 * IDP document pipeline recipes — operationId sequences for agents and clawql-documents.
 * Each stage maps to bundled MCP `execute` calls (see providers/nextcloud, paperless, …).
 */

export type IdpPipelineStage =
  "nextcloud" | "docling" | "tika" | "gotenberg" | "stirling" | "paperless" | "onyx" | "coneshare";

export type IdpPipelineStep = {
  stage: IdpPipelineStage;
  operationId: string;
  label: string;
  /** Suggested execute args shape (agent fills paths/ids). */
  argsTemplate?: Record<string, unknown>;
};

/** Default multi-hop IDP flow: Nextcloud intake → convert/redact → archive → index → share. */
export const DEFAULT_IDP_PIPELINE: IdpPipelineStep[] = [
  {
    stage: "nextcloud",
    operationId: "nextcloud::nextcloud_webdav_download",
    label: "Download from Nextcloud",
    argsTemplate: { username: "${NEXTCLOUD_USERNAME}", filePath: "${document_path}" },
  },
  {
    stage: "docling",
    operationId: "docling::docling_convert_source",
    label: "Layout parse (Docling)",
    argsTemplate: {
      sources: [{ kind: "http", url: "${document_url}" }],
      options: {
        to_formats: ["md", "json"],
        do_ocr: true,
        do_table_structure: true,
      },
    },
  },
  {
    stage: "tika",
    operationId: "tika::tika_parse_put",
    label: "Extract text (Tika)",
  },
  {
    stage: "gotenberg",
    operationId: "gotenberg::post_forms_libreoffice_convert",
    label: "Normalize PDF (Gotenberg)",
  },
  {
    stage: "stirling",
    operationId: "stirling::redactPdfAuto",
    label: "Redact PII (Stirling)",
  },
  {
    stage: "paperless",
    operationId: "paperless::documents_post_document_create",
    label: "Archive (Paperless)",
  },
  {
    stage: "onyx",
    operationId: "onyx::upsert_ingestion_doc",
    label: "Index (Onyx)",
  },
  {
    stage: "nextcloud",
    operationId: "nextcloud::nextcloud_webdav_upload",
    label: "Sync processed file to Nextcloud",
    argsTemplate: { username: "${NEXTCLOUD_USERNAME}", filePath: "IDP/processed/document.pdf" },
  },
  {
    stage: "coneshare",
    operationId: "coneshare::coneshare_datarooms_create",
    label: "Create Coneshare data room",
  },
  {
    stage: "coneshare",
    operationId: "coneshare::coneshare_share_links_create",
    label: "Create secure share link",
  },
];

/** Dashboard-compatible step labels from pipeline definition. */
export function pipelineStepsForDashboard(
  steps: IdpPipelineStep[],
  completedThrough: number
): Array<{ label: string; state: "done" | "active" | "pending" }> {
  return steps.map((s, i) => ({
    label: s.label,
    state: i < completedThrough ? "done" : i === completedThrough ? "active" : "pending",
  }));
}

/** Map execute operationId prefix → pipeline stage (for bridge enrichment). */
export function idpStageFromOperationId(operationId: string): IdpPipelineStage | null {
  const bare = operationId.includes("::") ? operationId.split("::")[0] : operationId.split("_")[0];
  const stage = bare?.toLowerCase();
  if (
    stage === "nextcloud" ||
    stage === "docling" ||
    stage === "tika" ||
    stage === "gotenberg" ||
    stage === "stirling" ||
    stage === "paperless" ||
    stage === "onyx" ||
    stage === "coneshare"
  ) {
    return stage;
  }
  return null;
}
