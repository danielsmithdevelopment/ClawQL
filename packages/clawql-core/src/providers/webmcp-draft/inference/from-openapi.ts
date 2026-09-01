import { Effect } from "effect";
import { createHash } from "node:crypto";
import type {
  DraftCandidate,
  JsonSchema,
  OpenApiDocument,
  ProposedWebMcpTool,
} from "../types.js";

const SKIP_PATH_RE =
  /\/(health|healthz|ready|readyz|live|livez|metrics|ping|internal|admin|_internal)(\/|$)/i;

const SKIP_OP_RE = /^(get|list)?(health|ready|live|ping|metrics)/i;

const USER_FACING_HINT_RE =
  /(cart|checkout|order|book|appoint|track|upload|search|create|add|submit|pay|reserv|login|signup|register|send|invite)/i;

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

function slugify(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function candidateId(sourceRef: string): string {
  const digest = createHash("sha256").update(`openapi:${sourceRef}`).digest("hex").slice(0, 12);
  return `cand_oa_${digest}`;
}

function parametersToSchema(
  parameters: NonNullable<
    NonNullable<OpenApiDocument["paths"]>[string][string]
  >["parameters"]
): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const param of parameters ?? []) {
    if (param.in === "header" || param.in === "cookie") continue;
    properties[param.name] = {
      ...(param.schema ?? { type: "string" }),
      description: param.description ?? param.schema?.description,
    };
    if (param.required) required.push(param.name);
  }
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

function mergeRequestBody(
  base: JsonSchema,
  requestBody: NonNullable<
    NonNullable<OpenApiDocument["paths"]>[string][string]
  >["requestBody"]
): JsonSchema {
  if (!requestBody?.content) return base;
  const content = requestBody.content;
  const preferred =
    content["application/json"] ??
    content["multipart/form-data"] ??
    content["application/x-www-form-urlencoded"] ??
    Object.values(content)[0];
  const bodySchema = preferred?.schema;
  if (!bodySchema) return base;
  const baseProps = base.properties ?? {};
  const bodyProps = bodySchema.properties ?? {};
  const required = [
    ...new Set([...(base.required ?? []), ...(bodySchema.required ?? [])]),
  ];
  return {
    type: "object",
    properties: { ...baseProps, ...bodyProps },
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

function shouldSkip(path: string, operationId: string | undefined, tags: readonly string[]): boolean {
  if (SKIP_PATH_RE.test(path)) return true;
  if (operationId && SKIP_OP_RE.test(operationId)) return true;
  if (tags.some((t) => /admin|internal|ops|infra/i.test(t))) return true;
  return false;
}

function confidenceFor(
  method: string,
  path: string,
  operationId: string | undefined,
  summary: string | undefined
): DraftCandidate["confidence"] {
  const haystack = `${method} ${path} ${operationId ?? ""} ${summary ?? ""}`;
  if (USER_FACING_HINT_RE.test(haystack)) {
    return method === "get" ? "medium" : "high";
  }
  if (method === "get") return "low";
  return "medium";
}

function toolFromOperation(
  path: string,
  method: string,
  op: NonNullable<NonNullable<OpenApiDocument["paths"]>[string][string]>
): DraftCandidate | null {
  const operationId = op.operationId;
  const tags = op.tags ?? [];
  if (shouldSkip(path, operationId, tags)) return null;

  const sourceRef = operationId ?? `${method.toUpperCase()} ${path}`;
  const name = slugify(operationId ?? `${method}_${path}`);
  const description =
    op.description?.trim() ||
    op.summary?.trim() ||
    `${method.toUpperCase()} ${path}`;

  let inputSchema = parametersToSchema(op.parameters);
  inputSchema = mergeRequestBody(inputSchema, op.requestBody);

  const proposedTool: ProposedWebMcpTool = { name, description, inputSchema };
  const confidence = confidenceFor(method, path, operationId, op.summary);
  if (confidence === "low" && method === "get" && !USER_FACING_HINT_RE.test(sourceRef)) {
    // Stub drafter: leave undrafted rather than flood the review queue.
    return null;
  }

  return {
    candidateId: candidateId(sourceRef),
    sourceType: "openapi",
    sourceRef,
    proposedTool,
    confidence,
    inferenceNotes: `Inferred from OpenAPI ${method.toUpperCase()} ${path} (${sourceRef}); confidence=${confidence} via heuristic filter (LLM filtering is a later revision).`,
  };
}

/**
 * Draft WebMCP tool candidates from an OpenAPI document.
 * Stub: deterministic heuristics only — no LLM. Filters health/admin noise and
 * prefers user-facing mutation patterns over enumerate-all-ops.
 */
export const draftFromOpenApi = (
  spec: OpenApiDocument
): Effect.Effect<readonly DraftCandidate[]> =>
  Effect.sync(() => {
    const paths = spec.paths ?? {};
    const out: DraftCandidate[] = [];
    for (const [path, item] of Object.entries(paths)) {
      if (!item) continue;
      for (const method of HTTP_METHODS) {
        const op = item[method];
        if (!op) continue;
        const candidate = toolFromOperation(path, method, op);
        if (candidate) out.push(candidate);
      }
    }
    return out;
  });
