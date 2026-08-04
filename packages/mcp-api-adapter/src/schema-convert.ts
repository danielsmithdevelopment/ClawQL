/**
 * MCP tool JSON Schema → OpenAPI 3.1 request/response schema fragments.
 * Happy-path converter with basic $ref / combinator passthrough.
 */

const TOOL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function isSafeToolPathName(name: string): boolean {
  return TOOL_NAME_RE.test(name);
}

/** Deep-clone JSON Schema for OpenAPI embedding; lift `$defs` into components when present. */
export function jsonSchemaToOpenApiSchema(
  schema: Record<string, unknown> | undefined,
  components: Record<string, unknown>,
  prefix: string
): Record<string, unknown> {
  if (!schema || typeof schema !== "object") {
    return { type: "object", additionalProperties: true };
  }

  const cloned = structuredClone(schema) as Record<string, unknown>;

  const defs = (cloned.$defs ?? cloned.definitions) as Record<string, unknown> | undefined;
  if (defs && typeof defs === "object") {
    for (const [key, def] of Object.entries(defs)) {
      const componentName = `${prefix}_${sanitizeComponentName(key)}`;
      components[componentName] = rewriteRefs(def as Record<string, unknown>, prefix);
    }
    delete cloned.$defs;
    delete cloned.definitions;
  }

  return rewriteRefs(cloned, prefix);
}

function sanitizeComponentName(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, "_");
}

function rewriteRefs(node: unknown, prefix: string): Record<string, unknown> {
  if (Array.isArray(node)) {
    return node.map((x) =>
      typeof x === "object" && x !== null ? rewriteRefs(x, prefix) : x
    ) as unknown as Record<string, unknown>;
  }
  if (node === null || typeof node !== "object") {
    return { type: "object", additionalProperties: true };
  }
  const obj = { ...(node as Record<string, unknown>) };
  if (typeof obj.$ref === "string") {
    const ref = obj.$ref;
    const m = ref.match(/^#\/(?:\$defs|definitions)\/(.+)$/);
    if (m) {
      obj.$ref = `#/components/schemas/${prefix}_${sanitizeComponentName(m[1]!)}`;
    }
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "$ref") continue;
    if (Array.isArray(v)) {
      obj[k] = v.map((item) =>
        typeof item === "object" && item !== null ? rewriteRefs(item, prefix) : item
      );
    } else if (typeof v === "object" && v !== null) {
      obj[k] = rewriteRefs(v, prefix);
    }
  }
  return obj;
}

/** Ensure request body schema is an object (wrap non-object roots). */
export function asObjectRequestSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (schema.type === "object" || schema.properties || schema.$ref) {
    return schema;
  }
  if (schema.anyOf || schema.oneOf || schema.allOf) {
    return schema;
  }
  return {
    type: "object",
    properties: {
      value: schema,
    },
    required: ["value"],
  };
}
