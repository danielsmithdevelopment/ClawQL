/**
 * JSON ↔ well-known `google.protobuf.Struct` / `Value` shapes for `model_context_protocol` protos
 * (wire-compatible with the community protobuf MCP schema).
 */

/** Build `google.protobuf.Struct` as a plain object (grpc/proto-loader friendly). */
export function jsonToStruct(data: unknown): { fields: Record<string, ReturnType<typeof jsonToValue>> } {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { fields: {} };
  }
  const fields: Record<string, ReturnType<typeof jsonToValue>> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    fields[k] = jsonToValue(v);
  }
  return { fields };
}

/** `google.protobuf.Value` as plain object (snake_case field names for proto3 JSON / proto-loader). */
export function jsonToValue(v: unknown): Record<string, unknown> {
  if (v === null) {
    return { null_value: 0 };
  }
  if (typeof v === "number") {
    return { number_value: v };
  }
  if (typeof v === "string") {
    return { string_value: v };
  }
  if (typeof v === "boolean") {
    return { bool_value: v };
  }
  if (Array.isArray(v)) {
    return {
      list_value: {
        values: v.map((x) => jsonToValue(x)),
      },
    };
  }
  if (typeof v === "object") {
    return { struct_value: jsonToStruct(v) };
  }
  return { string_value: String(v) };
}

/** Default list TTL (one hour, common default for list RPC caching). */
export function defaultListTtlDuration(): { seconds: number; nanos: number } {
  return { seconds: 3600, nanos: 0 };
}

/** Decode `google.protobuf.Value` (proto-loader shape) to JSON. */
export function valueToJson(v: Record<string, unknown> | undefined | null): unknown {
  if (v == null) {
    return null;
  }
  if ("null_value" in v) {
    return null;
  }
  if ("number_value" in v && v.number_value !== undefined) {
    return v.number_value;
  }
  if ("string_value" in v && v.string_value !== undefined) {
    return v.string_value;
  }
  if ("bool_value" in v && v.bool_value !== undefined) {
    return v.bool_value;
  }
  if ("struct_value" in v && v.struct_value && typeof v.struct_value === "object") {
    return structToJson(v.struct_value as { fields?: Record<string, unknown> });
  }
  if ("list_value" in v && v.list_value && typeof v.list_value === "object") {
    const values = (v.list_value as { values?: unknown[] }).values;
    if (!Array.isArray(values)) {
      return [];
    }
    return values.map((x) => valueToJson(x as Record<string, unknown>));
  }
  return undefined;
}

/** Decode `google.protobuf.Struct` (proto-loader shape) to a plain object. */
export function structToJson(s: { fields?: Record<string, unknown> } | undefined | null): Record<string, unknown> | undefined {
  if (s == null || typeof s !== "object") {
    return undefined;
  }
  const fields = s.fields;
  if (!fields || typeof fields !== "object") {
    return undefined;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = valueToJson(v as Record<string, unknown>);
  }
  return out;
}
