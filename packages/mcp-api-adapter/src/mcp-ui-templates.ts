import type { ListedMcpTool } from "mcp-grpc-transport";
import type { FormRenderHints } from "./mcp-ui-form.js";

export type McpUiResultKind = "json" | "search" | "memory" | "cache" | "audit";

export type McpUiTemplate = {
  /** Tool name or tag match. */
  id: string;
  primary: string[];
  defaults?: Record<string, unknown>;
  textareas?: string[];
  hints?: Record<string, string>;
  resultKind: McpUiResultKind;
};

const TEMPLATES: Record<string, McpUiTemplate> = {
  search: {
    id: "search",
    primary: ["query", "limit"],
    defaults: { limit: 5 },
    hints: {
      query: "Describe the operation in plain language — e.g. list github repositories.",
    },
    resultKind: "search",
  },
  memory_recall: {
    id: "memory_recall",
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
};

export function resolveMcpUiTemplate(tool: ListedMcpTool): McpUiTemplate | undefined {
  if (TEMPLATES[tool.name]) return TEMPLATES[tool.name];
  return undefined;
}

export function formHintsForTool(
  tool: ListedMcpTool,
  fieldErrors?: Record<string, string>
): FormRenderHints {
  const template = resolveMcpUiTemplate(tool);
  if (!template) {
    return { fieldErrors };
  }
  return {
    primary: template.primary,
    defaults: template.defaults,
    textareas: template.textareas,
    hints: template.hints,
    fieldErrors,
  };
}

export function resultKindForTool(toolName: string): McpUiResultKind {
  return TEMPLATES[toolName]?.resultKind ?? "json";
}

export function listMcpUiTemplates(): McpUiTemplate[] {
  return Object.values(TEMPLATES);
}
