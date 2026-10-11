/**
 * Shared helpers for mapping OpenAPI operations → GraphQL field names and variables.
 *
 * GraphQL name sanitization is local (Effect) so equal-arm / REST-prefer boots do not
 * pay `@graphql-mesh/utils` RSS (~20–40MB) until Omnigraph is actually needed.
 */

import { Effect } from "effect";
import type { GraphQLSchema } from "graphql";
import { INLINE_OPENAPI_REQUEST_BODY, type Operation } from "../spec/operation-types.js";

/** Mesh-compatible reserved GraphQL type names. */
const RESERVED_GRAPHQL_NAMES = ["Query", "Mutation", "Subscription", "File"] as const;

const KNOWN_GRAPHQL_NAME_CHARS: Record<string, string> = {
  "+": "PLUS",
  "-": "MINUS",
  ">": "GREATER_THAN",
  "<": "LESS_THAN",
  "=": "EQUALS",
  "&": "AMPERSAND",
  "|": "PIPE",
  "@": "AT",
  "*": "STAR",
  ":": "COLON",
  "{": "LEFT_CURLY_BRACE",
  "}": "RIGHT_CURLY_BRACE",
  "[": "LEFT_SQUARE_BRACE",
  "]": "RIGHT_SQUARE_BRACE",
  ",": "COMMA",
  "%": "PERCENT",
  $: "DOLLAR",
  "#": "POUND",
  "^": "CARET",
  "~": "TILDE",
  "?": "QUESTION_MARK",
  "!": "EXCLAMATION_MARK",
  '"': "QUOTATION_MARK",
  "'": "SINGLE_QUOTE",
  "\\": "BACKSLASH",
  "/": "SLASH",
  ".": "DOT",
  "`": "BACKTICK",
  ";": "SEMICOLON",
  "(": "LEFT_PARENTHESIS",
  ")": "RIGHT_PARENTHESIS",
};

function getKnownCharacterOrCharCode(ch: string): string {
  return KNOWN_GRAPHQL_NAME_CHARS[ch] || ch.charCodeAt(0).toString();
}

function removeClosedBrackets(val: string): string {
  let out = val;
  for (;;) {
    const match = out.match(/\(.+?\)/);
    const yesbrack = match?.[0];
    if (!yesbrack) break;
    out = out.replace(yesbrack, yesbrack.substring(1, yesbrack.length - 1));
  }
  return out;
}

/**
 * Sanitize an OpenAPI operation id / path fragment into a GraphQL-safe name.
 * Behavior matches `@graphql-mesh/utils` `sanitizeNameForGraphQL` (field-name parity).
 */
export function sanitizeNameForGraphQLEffect(unsafeName: string): Effect.Effect<string> {
  return Effect.sync(() => {
    let sanitizedName = removeClosedBrackets(unsafeName.trim());
    if (!Number.isNaN(Number.parseInt(sanitizedName, 10))) {
      if (sanitizedName.startsWith("-")) {
        sanitizedName = sanitizedName.replace("-", "NEGATIVE_");
      } else {
        sanitizedName = `_${sanitizedName}`;
      }
    }
    if (!/^[_a-zA-Z0-9]*$/.test(sanitizedName)) {
      const unsanitizedName = sanitizedName;
      sanitizedName = "";
      for (const ch of unsanitizedName) {
        if (/^[_a-zA-Z0-9]$/.test(ch)) {
          sanitizedName += ch;
        } else if (ch === " " || ch === "-" || ch === "." || ch === "/" || ch === ":") {
          sanitizedName += "_";
        } else {
          sanitizedName += `_${getKnownCharacterOrCharCode(ch)}_`;
        }
      }
    }
    if (sanitizedName.startsWith("__")) {
      sanitizedName = sanitizedName.replace("__", "_0");
    }
    if ((RESERVED_GRAPHQL_NAMES as readonly string[]).includes(sanitizedName)) {
      sanitizedName += "_";
    }
    return sanitizedName.length === 0 ? "_" : sanitizedName;
  });
}

/** Host façade for sync call sites inside field resolution. */
export function sanitizeNameForGraphQL(unsafeName: string): string {
  return Effect.runSync(sanitizeNameForGraphQLEffect(unsafeName));
}

export function operationIdToGraphQLName(op: Operation): string {
  const segments = op.flatPath.split("/").filter((s) => !s.startsWith("{") && s.length > 0);

  const methodSuffix = op.id.split(".").pop() ?? "";

  return (
    segments[0] +
    segments
      .slice(1)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join("") +
    methodSuffix.charAt(0).toUpperCase() +
    methodSuffix.slice(1)
  );
}

export function operationIdToRunStyleName(op: Operation): string {
  const parts = op.id.split(".");
  if (parts.length === 0) return op.id;
  return parts[0] + parts.slice(1).map(capitalize).join("");
}

export function lowerFirst(input: string): string {
  return input ? input.charAt(0).toLowerCase() + input.slice(1) : input;
}

function capitalize(input: string): string {
  return input ? input.charAt(0).toUpperCase() + input.slice(1) : input;
}

export function resolveGraphQLFieldFromSchema(
  schema: GraphQLSchema,
  op: Operation,
  gqlOpType: "query" | "mutation"
): { fieldName: string; fieldArgs: string[] } {
  const root = gqlOpType === "query" ? schema.getQueryType() : schema.getMutationType();
  if (!root) {
    throw new Error(`No GraphQL ${gqlOpType} type in schema`);
  }
  const fields = root.getFields();
  const byName = new Map(Object.entries(fields).map(([k, v]) => [k, v.args.map((a) => a.name)]));

  const candidates: string[] = [];
  candidates.push(sanitizeNameForGraphQL(op.id));
  candidates.push(operationIdToRunStyleName(op));
  candidates.push(operationIdToGraphQLName(op));
  if (op.responseBody) candidates.push(lowerFirst(op.responseBody));
  if (op.requestBody && op.requestBody !== INLINE_OPENAPI_REQUEST_BODY) {
    candidates.push(lowerFirst(op.requestBody));
  }

  for (const candidate of candidates) {
    const args = byName.get(candidate);
    if (args) return { fieldName: candidate, fieldArgs: args };
  }

  throw new Error(
    `No GraphQL ${gqlOpType} field found for operation "${op.id}". Tried: ${candidates.join(", ")}`
  );
}

export function normalizeArgsForField(
  op: Operation,
  rawArgs: Record<string, unknown>,
  expectedArgs: string[]
): Record<string, unknown> {
  const args: Record<string, unknown> = { ...rawArgs };
  const expected = new Set(expectedArgs);

  if (typeof args.parent === "string") {
    const parent = args.parent;
    const parentMatch = parent.match(/^projects\/([^/]+)\/locations\/([^/]+)$/);
    if (parentMatch) {
      if (expected.has("projectsId") && args.projectsId === undefined) {
        args.projectsId = parentMatch[1];
      }
      if (expected.has("locationsId") && args.locationsId === undefined) {
        args.locationsId = parentMatch[2];
      }
    }
  }

  if (typeof args.name === "string") {
    const captures = capturePathParams(op.flatPath, args.name);
    for (const [key, value] of Object.entries(captures)) {
      if (expected.has(key) && args[key] === undefined) {
        args[key] = value;
      }
    }
  }

  return Object.fromEntries(Object.entries(args).filter(([key]) => expected.has(key)));
}

export function capturePathParams(flatPath: string, value: string): Record<string, string> {
  const templateParts = flatPath.split("/").filter(Boolean);
  const valueParts = value.split("/").filter(Boolean);
  if (templateParts.length !== valueParts.length) return {};

  const out: Record<string, string> = {};
  for (let i = 0; i < templateParts.length; i++) {
    const tpl = templateParts[i];
    const actual = valueParts[i];
    const match = tpl.match(/^\{(\w+)\}$/);
    if (match) {
      out[match[1]] = actual;
      continue;
    }
    if (tpl !== actual) return {};
  }
  return out;
}

export function buildVarDeclarations(op: Operation, args: Record<string, unknown>): string {
  return Object.keys(args)
    .map((key) => {
      const param = op.parameters[key];
      const gqlType = param ? discoveryTypeToGraphQL(param.type, param.required) : "String";
      return `$${key}: ${gqlType}`;
    })
    .join(", ");
}

export function buildVarArgs(args: Record<string, unknown>): string {
  return Object.keys(args)
    .map((key) => `${key}: $${key}`)
    .join(", ");
}

export function discoveryTypeToGraphQL(type: string, required?: boolean): string {
  const base: Record<string, string> = {
    string: "String",
    integer: "Int",
    boolean: "Boolean",
    number: "Float",
  };
  const gql = base[type] ?? "String";
  return required ? `${gql}!` : gql;
}
