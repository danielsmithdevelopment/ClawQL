import type { ListedMcpTool } from "mcp-grpc-transport";
import type { McpUiTemplate } from "./types.js";

/**
 * Reusable HTMX patterns — matched by name or heuristics, not one-off products.
 */
export const PATTERN_TEMPLATES: Record<string, McpUiTemplate> = {
  upload_photo: {
    id: "upload_photo",
    kind: "pattern",
    primary: ["file", "filename", "caption"],
    hints: {
      file: "Base64-encoded image — smart-upload converts/resizes client-side before submit.",
      filename: "Display filename after conversion (often .jpg).",
    },
    resultKind: "json",
    customHtml: "smart-upload",
  },
  cf_claim_coupon: {
    id: "cf_claim_coupon",
    kind: "pattern",
    primary: [],
    hints: {},
    resultKind: "json",
    customHtml: "claim-button",
  },
  claim_coupon: {
    id: "claim_coupon",
    kind: "pattern",
    primary: [],
    hints: {},
    resultKind: "json",
    customHtml: "claim-button",
  },
  reveal_extra_credits_link: {
    id: "reveal_extra_credits_link",
    kind: "pattern",
    primary: [],
    hints: {},
    resultKind: "json",
    customHtml: "claim-button",
  },
};

const SMART_UPLOAD_NAME = /^upload_(photo|image|file|picture)s?$/i;
const SMART_UPLOAD_VERB = /\bupload\b/i;
const SMART_UPLOAD_NOUN = /\b(photo|image|picture|gallery)\b/i;

const CLAIM_BUTTON_NAME =
  /^(cf_)?claim_(coupon|offer|reward|starter_pack)$|^reveal_extra_credits_link$/i;
const CLAIM_BUTTON_TEXT = /\b(claim|credits|activation)\b/i;

export function isNamedSmartUploadTemplate(name: string): boolean {
  return PATTERN_TEMPLATES[name]?.customHtml === "smart-upload";
}

export function isNamedClaimTemplate(name: string): boolean {
  return PATTERN_TEMPLATES[name]?.customHtml === "claim-button";
}

/** Match WebMCP-style upload tools for the smart-upload HTMX template. */
export function isSmartUploadTool(tool: ListedMcpTool): boolean {
  if (isNamedSmartUploadTemplate(tool.name)) return true;
  if (SMART_UPLOAD_NAME.test(tool.name)) return true;
  const text = `${tool.name} ${tool.title ?? ""} ${tool.description ?? ""}`.toLowerCase();
  if (SMART_UPLOAD_VERB.test(text) && SMART_UPLOAD_NOUN.test(text)) return true;
  const props = (tool.inputSchema as { properties?: Record<string, unknown> } | undefined)
    ?.properties;
  if (props && "file" in props && SMART_UPLOAD_NOUN.test(text)) return true;
  return false;
}

/** Match WebMCP-style claim tools for the click-to-claim HTMX template. */
export function isClaimButtonTool(tool: ListedMcpTool): boolean {
  if (isNamedClaimTemplate(tool.name)) return true;
  if (CLAIM_BUTTON_NAME.test(tool.name)) return true;
  const text = `${tool.name} ${tool.title ?? ""} ${tool.description ?? ""}`.toLowerCase();
  if (CLAIM_BUTTON_TEXT.test(text) && /\b(coupon|offer|reward|pack|credits)\b/i.test(text)) {
    return true;
  }
  return false;
}

export const SMART_UPLOAD_FALLBACK: McpUiTemplate = {
  id: "smart-upload",
  kind: "pattern",
  primary: ["file", "filename", "caption"],
  resultKind: "json",
  customHtml: "smart-upload",
};

export const CLAIM_BUTTON_FALLBACK: McpUiTemplate = {
  id: "claim-button",
  kind: "pattern",
  primary: [],
  resultKind: "json",
  customHtml: "claim-button",
};
