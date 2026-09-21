export type McpUiResultKind = "json" | "search" | "memory" | "cache" | "audit" | "idp";

export type McpUiCustomHtml = "smart-upload" | "claim-button";

/** Where a template belongs so starter catalogs stay small. */
export type McpUiTemplateKind = "core" | "pattern" | "example";

export type McpUiTemplate = {
  /** Tool name or tag match. */
  id: string;
  kind: McpUiTemplateKind;
  primary: string[];
  defaults?: Record<string, unknown>;
  textareas?: string[];
  fileFields?: string[];
  hints?: Record<string, string>;
  resultKind: McpUiResultKind;
  /** Pre-built HTMX fragment instead of auto-generated form fields. */
  customHtml?: McpUiCustomHtml;
};
