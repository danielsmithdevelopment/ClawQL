/**
 * spec-loader.ts
 *
 * Fetches the Cloud Run v2 Google Discovery spec and flattens the nested
 * resource tree into a searchable, indexed list of operations.
 *
 * Also converts the Discovery format → OpenAPI 3.0 for the GraphQL layer.
 */

import fetch from "node-fetch";

const DISCOVERY_URL =
  "https://run.googleapis.com/$discovery/rest?version=v2";

export interface Operation {
  id: string;           // e.g. "run.projects.locations.services.create"
  method: string;       // GET | POST | PATCH | DELETE
  path: string;         // e.g. "v2/{+parent}/services"
  flatPath: string;     // e.g. "v2/projects/{projectsId}/locations/{locationsId}/services"
  description: string;
  resource: string;     // human label e.g. "services"
  parameters: Record<string, ParameterInfo>;
  scopes: string[];
  requestBody?: string; // $ref name if POST/PATCH
  responseBody?: string;
}

export interface ParameterInfo {
  type: string;
  location: "path" | "query";
  required: boolean;
  description: string;
}

export interface LoadedSpec {
  operations: Operation[];
  rawDiscovery: DiscoveryDoc;
  openapi: OpenAPIDoc;
}

// Minimal typings for the Google Discovery format
interface DiscoveryDoc {
  rootUrl: string;
  servicePath: string;
  resources: Record<string, DiscoveryResource>;
  parameters?: Record<string, unknown>;
  [key: string]: unknown;
}

interface DiscoveryResource {
  methods?: Record<string, DiscoveryMethod>;
  resources?: Record<string, DiscoveryResource>;
}

interface DiscoveryMethod {
  id: string;
  httpMethod: string;
  path: string;
  flatPath: string;
  description?: string;
  parameters?: Record<string, DiscoveryParam>;
  scopes?: string[];
  request?: { $ref: string };
  response?: { $ref: string };
}

interface DiscoveryParam {
  type: string;
  location: string;
  required?: boolean;
  description?: string;
}

// Minimal OpenAPI typings
interface OpenAPIDoc {
  openapi: string;
  info: { title: string; version: string };
  servers: { url: string }[];
  paths: Record<string, unknown>;
  components: {
    schemas: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
}

const DISCOVERY_SCHEMA_METADATA_KEYS = new Set([
  "id",
  "enumDescriptions",
  "enumDeprecated",
]);

export function sanitizeSchemaNode(
  value: unknown,
  inPropertiesMap = false
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSchemaNode(item, false));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(input)) {
    // Discovery-only schema metadata not supported by OpenAPI 3.
    if (
      DISCOVERY_SCHEMA_METADATA_KEYS.has(key) &&
      (!inPropertiesMap || key !== "id")
    ) {
      continue;
    }
    // Discovery sometimes emits non-standard type "any"; in OpenAPI this is
    // represented as an unconstrained schema (i.e. omit the type keyword).
    if (key === "type" && child === "any") {
      continue;
    }
    // Discovery refs may be bare schema names; OpenAPI requires JSON pointers.
    if (key === "$ref" && typeof child === "string") {
      if (child.startsWith("#/")) {
        output[key] = child;
      } else if (child.startsWith("#")) {
        output[key] = `#/${child.slice(1).replace(/^\/+/, "")}`;
      } else {
        output[key] = `#/components/schemas/${child}`;
      }
      continue;
    }
    output[key] = sanitizeSchemaNode(child, key === "properties");
  }

  return output;
}

// ─────────────────────────────────────────────
// Fetch + cache
// ─────────────────────────────────────────────

let cachedSpec: LoadedSpec | null = null;

export async function loadSpec(): Promise<LoadedSpec> {
  if (cachedSpec) return cachedSpec;

  console.error("[spec-loader] Fetching Cloud Run v2 discovery spec…");
  const res = await fetch(DISCOVERY_URL);
  if (!res.ok) throw new Error(`Failed to fetch spec: ${res.status}`);
  const discovery = (await res.json()) as DiscoveryDoc;

  const operations = flattenOperations(discovery.resources, []);
  const openapi = discoveryToOpenAPI(discovery, operations);

  cachedSpec = { operations, rawDiscovery: discovery, openapi };
  console.error(
    `[spec-loader] Loaded ${operations.length} operations from Cloud Run v2 spec.`
  );
  return cachedSpec;
}

// ─────────────────────────────────────────────
// Flatten the nested resource tree
// ─────────────────────────────────────────────

function flattenOperations(
  resources: Record<string, DiscoveryResource>,
  parentPath: string[]
): Operation[] {
  const ops: Operation[] = [];

  for (const [resourceName, resource] of Object.entries(resources)) {
    const resourcePath = [...parentPath, resourceName];

    // Methods at this level
    if (resource.methods) {
      for (const [, method] of Object.entries(resource.methods)) {
        ops.push(methodToOperation(method, resourceName));
      }
    }

    // Recurse into child resources
    if (resource.resources) {
      ops.push(...flattenOperations(resource.resources, resourcePath));
    }
  }

  return ops;
}

function methodToOperation(m: DiscoveryMethod, resourceName: string): Operation {
  const params: Record<string, ParameterInfo> = {};
  for (const [name, p] of Object.entries(m.parameters ?? {})) {
    params[name] = {
      type: p.type,
      location: p.location as "path" | "query",
      required: p.required ?? false,
      description: p.description ?? "",
    };
  }

  return {
    id: m.id,
    method: m.httpMethod,
    path: m.path,
    flatPath: m.flatPath,
    description: m.description ?? "",
    resource: resourceName,
    parameters: params,
    scopes: m.scopes ?? [],
    requestBody: m.request?.$ref,
    responseBody: m.response?.$ref,
  };
}

// ─────────────────────────────────────────────
// Discovery → minimal OpenAPI 3.0
// (enough for openapi-to-graphql to consume)
// ─────────────────────────────────────────────

export function discoveryToOpenAPI(
  doc: DiscoveryDoc,
  operations: Operation[]
): OpenAPIDoc {
  const baseUrl = (doc.rootUrl as string).replace(/\/$/, "");
  const paths: Record<string, Record<string, unknown>> = {};
  const oauthScopes: Record<string, string> = {};

  for (const op of operations) {
    for (const scope of op.scopes) {
      oauthScopes[scope] = scope;
    }
    // Convert {+param} / {param} → {param} for OpenAPI
    const oaPath =
      "/" + op.flatPath.replace(/\{[+]?(\w+)\}/g, "{$1}");

    if (!paths[oaPath]) paths[oaPath] = {};

    const httpVerb = op.method.toLowerCase();
    const parameters = Object.entries(op.parameters)
      .filter(([name, p]) => {
        // OAS requires all path params to appear in the path template.
        if (p.location !== "path") return true;
        return oaPath.includes(`{${name}}`);
      })
      .map(([name, p]) => ({
        name,
        in: p.location,
        required: p.required,
        description: p.description,
        schema: { type: p.type },
      }));

    // Some Discovery operations use aggregate params (e.g. "{+name}") and do not
    // explicitly list split template vars from flatPath; synthesize them for OAS.
    const templateVars = Array.from(oaPath.matchAll(/\{(\w+)\}/g)).map(
      (match) => match[1]
    );
    for (const name of templateVars) {
      if (!parameters.some((param) => param.name === name)) {
        parameters.push({
          name,
          in: "path",
          required: true,
          description: `Path parameter ${name}`,
          schema: { type: "string" },
        });
      }
    }

    paths[oaPath][httpVerb] = {
      operationId: op.id.replace(/\./g, "_"),
      summary: op.description,
      description: op.description,
      parameters,
      ...(op.requestBody
        ? {
            requestBody: {
              content: {
                "application/json": {
                  schema: { $ref: `#/components/schemas/${op.requestBody}` },
                },
              },
            },
          }
        : {}),
      responses: {
        "200": {
          description: "Success",
          ...(op.responseBody
            ? {
                content: {
                  "application/json": {
                    schema: {
                      $ref: `#/components/schemas/${op.responseBody}`,
                    },
                  },
                },
              }
            : {}),
        },
      },
      security: [{ oauth2: op.scopes }],
    };
  }

  return {
    openapi: "3.0.3",
    info: { title: "Google Cloud Run API v2", version: "v2" },
    servers: [{ url: baseUrl }],
    paths,
    components: {
      schemas: sanitizeSchemaNode(
        (doc.schemas as Record<string, unknown>) ?? {}
      ) as Record<string, unknown>,
      securitySchemes: {
        oauth2: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: "https://accounts.google.com/o/oauth2/auth",
              tokenUrl: "https://oauth2.googleapis.com/token",
              scopes: oauthScopes,
            },
          },
        },
      },
    },
  };
}