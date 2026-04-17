/**
 * JSON ↔ well-known `google.protobuf.Struct` / `Value` shapes for `model_context_protocol` protos
 * (wire-compatible with the community protobuf MCP schema).
 */

/** Build `google.protobuf.Struct` as a plain object (grpc/proto-loader friendly). */
export function jsonToStruct(data: unknown): {
  fields: Record<string, ReturnType<typeof jsonToValue>>;
} {
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

function pickValueField<T>(v: Record<string, unknown>, snake: string, camel: string): T | undefined {
  const s = v[snake];
  if (s !== undefined) {
    return s as T;
  }
  const c = v[camel];
  return c !== undefined ? (c as T) : undefined;
}

/** Decode `google.protobuf.Value` (proto-loader shape) to JSON. */
export function valueToJson(v: Record<string, unknown> | undefined | null): unknown {
  if (v == null) {
    return null;
  }
  if ("null_value" in v || "nullValue" in v) {
    return null;
  }
  const num = pickValueField<number>(v, "number_value", "numberValue");
  if (num !== undefined) {
    return num;
  }
  const str = pickValueField<string>(v, "string_value", "stringValue");
  if (str !== undefined) {
    return str;
  }
  const bool = pickValueField<boolean>(v, "bool_value", "boolValue");
  if (bool !== undefined) {
    return bool;
  }
  const structVal = (v.struct_value ?? v.structValue) as { fields?: Record<string, unknown> } | undefined;
  if (structVal && typeof structVal === "object") {
    return structToJson(structVal);
  }
  const listVal = (v.list_value ?? v.listValue) as { values?: unknown[] } | undefined;
  if (listVal && typeof listVal === "object") {
    const values = listVal.values;
    if (!Array.isArray(values)) {
      return [];
    }
    return values.map((x) => valueToJson(x as Record<string, unknown>));
  }
  return undefined;
}

/** `google.protobuf.Struct.fields` may be a plain object or a `Map` (some gRPC / proto decoders). */
function structFieldEntries(
  fields: Record<string, unknown> | Map<string, unknown>
): [string, unknown][] {
  if (fields instanceof Map) {
    return [...fields.entries()];
  }
  return Object.entries(fields);
}

/** Decode `google.protobuf.Struct` (proto-loader shape) to a plain object. */
export function structToJson(
  s:
    | { fields?: Record<string, unknown> | Map<string, unknown> }
    | undefined
    | null
): Record<string, unknown> | undefined {
  if (s == null || typeof s !== "object") {
    return undefined;
  }
  const fields = s.fields;
  if (!fields || typeof fields !== "object") {
    return undefined;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of structFieldEntries(fields as Record<string, unknown> | Map<string, unknown>)) {
    out[k] = valueToJson(v as Record<string, unknown>);
  }
  return out;
}
