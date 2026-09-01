import { randomUUID } from "node:crypto";
import type { ListedMcpTool } from "mcp-grpc-transport";

export type GeneratedUiStep = {
  tool: string;
  label?: string;
  dependsOn?: string;
};

export type GeneratedUiDefinition = {
  title: string;
  description?: string;
  steps: GeneratedUiStep[];
  /** URL path segment under /mcp-ui/custom/ */
  slug?: string;
};

export type GeneratedUiForm = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  steps: GeneratedUiStep[];
  createdAt: number;
  /** Collected outputs keyed by tool name. */
  stepOutputs: Record<string, unknown>;
  currentStepIndex: number;
};

const forms = new Map<string, GeneratedUiForm>();
const bySlug = new Map<string, string>();
const TTL_MS = 60 * 60 * 1000;
const MAX_FORMS = 100;

function sweep(): void {
  const now = Date.now();
  for (const [id, form] of forms) {
    if (now - form.createdAt > TTL_MS) {
      forms.delete(id);
      bySlug.delete(form.slug);
    }
  }
  while (forms.size > MAX_FORMS) {
    const oldest = forms.keys().next().value;
    if (!oldest) break;
    const form = forms.get(oldest);
    forms.delete(oldest);
    if (form) bySlug.delete(form.slug);
  }
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "custom-form"
  );
}

export function createGeneratedUi(
  def: GeneratedUiDefinition,
  catalogTools: ListedMcpTool[]
): GeneratedUiForm {
  sweep();
  if (!def.title?.trim()) throw new Error("title is required");
  if (!Array.isArray(def.steps) || def.steps.length === 0) {
    throw new Error("steps must be a non-empty array");
  }

  const known = new Set(catalogTools.map((t) => t.name));
  for (const step of def.steps) {
    if (!step.tool?.trim()) throw new Error("each step needs a tool name");
    if (!known.has(step.tool)) {
      throw new Error(`Unknown tool in workflow: ${step.tool}`);
    }
  }

  let slug = (def.slug?.trim() || slugify(def.title)).replace(/^\/+|\/+$/g, "");
  if (bySlug.has(slug)) slug = `${slug}-${randomUUID().slice(0, 8)}`;

  const form: GeneratedUiForm = {
    id: randomUUID(),
    slug,
    title: def.title.trim(),
    description: def.description?.trim(),
    steps: def.steps.map((s) => ({
      tool: s.tool,
      label: s.label?.trim() || s.tool,
      dependsOn: s.dependsOn,
    })),
    createdAt: Date.now(),
    stepOutputs: {},
    currentStepIndex: 0,
  };
  forms.set(form.id, form);
  bySlug.set(form.slug, form.id);
  return form;
}

export function getGeneratedUiBySlug(slug: string): GeneratedUiForm | undefined {
  const id = bySlug.get(slug);
  return id ? forms.get(id) : undefined;
}

export function getGeneratedUiById(id: string): GeneratedUiForm | undefined {
  return forms.get(id);
}

export function listGeneratedUis(): GeneratedUiForm[] {
  sweep();
  return [...forms.values()];
}
