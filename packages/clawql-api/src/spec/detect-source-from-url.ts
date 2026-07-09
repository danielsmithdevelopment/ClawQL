/**
 * Detect integration spec kind from a remote URL (Executor-style add source).
 */

import { parse as parseYaml } from "yaml";
import type { CustomSourceKind } from "./custom-sources-types.js";

export type DetectedSource = {
  kind: CustomSourceKind;
  /** Suggested display name from spec metadata when available. */
  name?: string;
  /** GraphQL endpoint when kind is graphql and differs from url. */
  graphqlEndpoint?: string;
  /** Raw text for caching. */
  bodyText: string;
  parsed: unknown;
};

function parseBody(text: string): unknown {
  const t = text.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    return JSON.parse(t) as unknown;
  }
  return parseYaml(t) as unknown;
}

function isSwagger2(obj: unknown): boolean {
  return (
    typeof obj === "object" && obj !== null && (obj as Record<string, unknown>).swagger === "2.0"
  );
}

function isOpenAPI3(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return typeof o.openapi === "string" && o.openapi.startsWith("3");
}

function isDiscoveryDoc(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.rootUrl === "string" && o.resources != null && !("openapi" in o) && !("swagger" in o)
  );
}

function isGraphqlIntrospection(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  if (o.data && typeof o.data === "object") {
    const data = o.data as Record<string, unknown>;
    if (data.__schema) return true;
  }
  if (o.__schema) return true;
  return false;
}

function isGraphqlSdl(text: string): boolean {
  const t = text.trim();
  return /\btype\s+Query\b/.test(t) || /\btype\s+Mutation\b/.test(t) || /\bschema\s*\{/.test(t);
}

function titleFromOpenApi(obj: unknown): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const info = (obj as Record<string, unknown>).info;
  if (!info || typeof info !== "object") return undefined;
  const title = (info as Record<string, unknown>).title;
  return typeof title === "string" && title.trim() ? title.trim() : undefined;
}

function looksLikeMcpEndpoint(url: string): boolean {
  const u = url.toLowerCase();
  return u.endsWith("/mcp") || u.includes("/mcp/") || u.includes("mcp.");
}

/**
 * Fetch URL and infer source kind. Throws on HTTP errors.
 * Pass `kindHint` to skip auto-detection (mcp, cli, grpc).
 */
export async function detectSourceFromUrl(
  url: string,
  options: { kindHint?: CustomSourceKind; fetchFn?: typeof fetch } = {}
): Promise<DetectedSource> {
  const fetchFn = options.fetchFn ?? fetch;
  const kindHint = options.kindHint;

  if (kindHint === "mcp" || (kindHint === undefined && looksLikeMcpEndpoint(url))) {
    return {
      kind: "mcp",
      name: new URL(url).hostname,
      bodyText: "",
      parsed: null,
    };
  }

  if (kindHint === "cli") {
    throw new Error("CLI sources require --command; URL detection is not supported for cli kind.");
  }

  const res = await fetchFn(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch source URL (${res.status}): ${url}`);
  }
  const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
  const bodyText = await res.text();

  if (!bodyText.trim()) {
    if (looksLikeMcpEndpoint(url)) {
      return { kind: "mcp", name: new URL(url).hostname, bodyText, parsed: null };
    }
    throw new Error("Empty response from URL — cannot detect source kind.");
  }

  let parsed: unknown;
  try {
    parsed = parseBody(bodyText);
  } catch {
    if (isGraphqlSdl(bodyText)) {
      return {
        kind: "graphql",
        name: new URL(url).hostname,
        graphqlEndpoint: url,
        bodyText,
        parsed: bodyText,
      };
    }
    if (contentType.includes("protobuf") || url.endsWith(".proto")) {
      return { kind: "grpc", name: new URL(url).hostname, bodyText, parsed: bodyText };
    }
    throw new Error("Unsupported document: not JSON/YAML OpenAPI, Discovery, GraphQL, or SDL.");
  }

  if (kindHint === "grpc" || url.endsWith(".proto")) {
    return { kind: "grpc", name: new URL(url).hostname, bodyText, parsed };
  }

  if (isDiscoveryDoc(parsed)) {
    const name =
      typeof (parsed as Record<string, unknown>).name === "string"
        ? String((parsed as Record<string, unknown>).name)
        : (titleFromOpenApi(parsed) ?? new URL(url).hostname);
    return { kind: "discovery", name, bodyText, parsed };
  }

  if (isOpenAPI3(parsed) || isSwagger2(parsed)) {
    return {
      kind: "openapi",
      name: titleFromOpenApi(parsed) ?? new URL(url).hostname,
      bodyText,
      parsed,
    };
  }

  if (isGraphqlIntrospection(parsed)) {
    return {
      kind: "graphql",
      name: new URL(url).hostname,
      graphqlEndpoint: url.replace(/\/introspection\.json$/i, "").replace(/\/graphql$/i, "") || url,
      bodyText,
      parsed,
    };
  }

  if (isGraphqlSdl(bodyText)) {
    return {
      kind: "graphql",
      name: new URL(url).hostname,
      graphqlEndpoint: url,
      bodyText,
      parsed: bodyText,
    };
  }

  if (looksLikeMcpEndpoint(url)) {
    return { kind: "mcp", name: new URL(url).hostname, bodyText, parsed };
  }

  throw new Error(
    "Could not detect source kind. Use --kind openapi|discovery|graphql|grpc|mcp|cli."
  );
}
