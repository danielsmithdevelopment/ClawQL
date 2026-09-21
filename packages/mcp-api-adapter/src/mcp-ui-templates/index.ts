import { Effect } from "effect";
import type { ListedMcpTool } from "mcp-grpc-transport";
import type { FormRenderHints } from "../mcp-ui-form.js";
import { CORE_TEMPLATES } from "./core.js";
import { EXAMPLE_TEMPLATES } from "./examples.js";
import {
  CLAIM_BUTTON_FALLBACK,
  isClaimButtonTool,
  isSmartUploadTool,
  PATTERN_TEMPLATES,
  SMART_UPLOAD_FALLBACK,
} from "./patterns.js";
import type { McpUiResultKind, McpUiTemplate, McpUiTemplateKind } from "./types.js";

export type {
  McpUiCustomHtml,
  McpUiResultKind,
  McpUiTemplate,
  McpUiTemplateKind,
} from "./types.js";
export { CORE_TEMPLATES } from "./core.js";
export { EXAMPLE_TEMPLATES } from "./examples.js";
export {
  CLAIM_BUTTON_FALLBACK,
  isClaimButtonTool,
  isSmartUploadTool,
  PATTERN_TEMPLATES,
  SMART_UPLOAD_FALLBACK,
} from "./patterns.js";

const TEMPLATES: Record<string, McpUiTemplate> = {
  ...CORE_TEMPLATES,
  ...PATTERN_TEMPLATES,
  ...EXAMPLE_TEMPLATES,
};

const resolveTemplateValue = (tool: ListedMcpTool): McpUiTemplate | undefined => {
  if (TEMPLATES[tool.name]) return TEMPLATES[tool.name];
  if (isSmartUploadTool(tool)) return SMART_UPLOAD_FALLBACK;
  if (isClaimButtonTool(tool)) return CLAIM_BUTTON_FALLBACK;
  return undefined;
};

export const resolveMcpUiTemplate = (
  tool: ListedMcpTool
): Effect.Effect<McpUiTemplate | undefined> => Effect.sync(() => resolveTemplateValue(tool));

export const runResolveMcpUiTemplate = (tool: ListedMcpTool): McpUiTemplate | undefined =>
  Effect.runSync(resolveMcpUiTemplate(tool));

export const formHintsForTool = (
  tool: ListedMcpTool,
  fieldErrors?: Record<string, string>
): Effect.Effect<FormRenderHints> =>
  Effect.gen(function* () {
    const template = yield* resolveMcpUiTemplate(tool);
    if (!template) {
      return { fieldErrors };
    }
    return {
      primary: template.primary,
      defaults: template.defaults,
      textareas: template.textareas,
      fileFields: template.fileFields,
      hints: template.hints,
      fieldErrors,
    };
  });

export const runFormHintsForTool = (
  tool: ListedMcpTool,
  fieldErrors?: Record<string, string>
): FormRenderHints => Effect.runSync(formHintsForTool(tool, fieldErrors));

export const resultKindForTool = (toolName: string): Effect.Effect<McpUiResultKind> =>
  Effect.sync(() => {
    const explicit = TEMPLATES[toolName]?.resultKind;
    if (explicit) return explicit;
    if (/(^|_)search$/i.test(toolName) || /search_/i.test(toolName)) return "search";
    return "json";
  });

export const runResultKindForTool = (toolName: string): McpUiResultKind =>
  Effect.runSync(resultKindForTool(toolName));

export const listMcpUiTemplates = (filter?: {
  kind?: McpUiTemplateKind | readonly McpUiTemplateKind[];
}): Effect.Effect<McpUiTemplate[]> =>
  Effect.sync(() => {
    const kinds =
      filter?.kind == null
        ? null
        : new Set(Array.isArray(filter.kind) ? filter.kind : [filter.kind]);
    return Object.values(TEMPLATES).filter((t) => !kinds || kinds.has(t.kind));
  });

export const runListMcpUiTemplates = (filter?: {
  kind?: McpUiTemplateKind | readonly McpUiTemplateKind[];
}): McpUiTemplate[] => Effect.runSync(listMcpUiTemplates(filter));
