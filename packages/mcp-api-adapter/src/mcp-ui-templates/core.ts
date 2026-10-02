import type { McpUiTemplate } from "./types.js";

/**
 * Starter templates for common MCP tools.
 * Keep this list small — one-off integrations belong in `examples.ts`.
 */
export const CORE_TEMPLATES: Record<string, McpUiTemplate> = {
  search: {
    id: "search",
    kind: "core",
    primary: ["query", "limit"],
    defaults: { limit: 5 },
    hints: {
      query: "Describe the operation in plain language — e.g. list github repositories.",
    },
    resultKind: "search",
  },
  docs_search: {
    id: "docs_search",
    kind: "core",
    primary: ["query", "limit"],
    defaults: { limit: 6 },
    hints: {
      query: "Keywords across curated docs snippets — e.g. mcp-ui, celld, memory.",
    },
    resultKind: "search",
  },
  memory_recall: {
    id: "memory_recall",
    kind: "core",
    primary: ["query", "limit"],
    defaults: { limit: 10 },
    hints: {
      query: "Keywords or a natural-language question against the vault.",
      limit: "Defaults to 10 when left to the server; prefilled for convenience.",
    },
    resultKind: "memory",
  },
  memory_ingest: {
    id: "memory_ingest",
    kind: "core",
    primary: ["title", "insights", "conversation", "append"],
    textareas: ["insights", "conversation", "description", "toolOutputs"],
    defaults: { append: true },
    hints: {
      title: "Becomes the Obsidian page title and file name.",
      insights: "The durable takeaway to store in the vault.",
    },
    resultKind: "memory",
  },
  cache: {
    id: "cache",
    kind: "core",
    primary: ["operation", "key", "value", "prefix", "query", "limit"],
    hints: {
      operation: "Pick an operation first. Only fill the fields that apply.",
      key: "Used by set / get / delete.",
      value: "Used by set.",
      prefix: "Optional filter for list.",
      query: "Substring filter for search.",
      limit: "Caps list / search results.",
    },
    resultKind: "cache",
  },
  audit: {
    id: "audit",
    kind: "core",
    primary: ["operation", "category", "action", "summary", "limit"],
    textareas: ["summary"],
    hints: {
      operation: "append records; list / verify / clear inspect the chain.",
      category: "Required for append (e.g. tool_call).",
      action: "Required for append.",
      summary: "Required for append — avoid secrets.",
      limit: "For list (default 20).",
    },
    resultKind: "audit",
  },
  run_idp_pipeline: {
    id: "run_idp_pipeline",
    kind: "core",
    primary: ["pdf_base64", "dry_run", "document_path", "document_url", "correlation_id"],
    fileFields: ["pdf_base64"],
    defaults: { dry_run: true },
    hints: {
      pdf_base64: "Upload a PDF — encoded to pdf_base64 before CallTool.",
      dry_run: "Keep true to plan hops without executing providers.",
      document_path: "Nextcloud relative path when using inbox download instead of upload.",
      document_url: "HTTP(S) URL for Docling when not using pdf_base64.",
    },
    resultKind: "idp",
  },
  convert_document: {
    id: "convert_document",
    kind: "core",
    primary: ["base64", "path", "format"],
    fileFields: ["base64"],
    hints: {
      base64: "Upload a document — encoded to base64 before CallTool.",
    },
    resultKind: "idp",
  },
  inspect_pdf: {
    id: "inspect_pdf",
    kind: "core",
    primary: ["base64", "path"],
    fileFields: ["base64"],
    hints: {
      base64: "Upload a PDF — encoded to base64 before CallTool.",
    },
    resultKind: "idp",
  },
};
