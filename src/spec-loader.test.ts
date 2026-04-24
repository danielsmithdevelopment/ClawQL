import { afterEach, describe, expect, it } from "vitest";
import {
  discoveryToOpenAPI,
  resolveApiBaseUrl,
  resolveApiBaseUrlForOperation,
  resolveBundledSelfHostedBaseUrl,
  sanitizeOpenAPIObject,
  sanitizeOpenAPIDocument,
  sanitizeSchemaNode,
  type OpenAPIDoc,
  type Operation,
} from "./spec-loader.js";
import { operationsFromOpenAPI } from "./openapi-operations.js";

describe("operationsFromOpenAPI", () => {
  it("prefers multipart/form-data over application/json when both are declared", () => {
    const doc = {
      openapi: "3.0.0",
      info: { title: "t", version: "1" },
      servers: [{ url: "http://x" }],
      paths: {
        "/x": {
          post: {
            operationId: "postX",
            requestBody: {
              content: {
                "application/json": { schema: { type: "object" } },
                "multipart/form-data": { schema: { type: "object" } },
              },
            },
            responses: { "200": { description: "ok" } },
          },
        },
      },
      components: { schemas: {} },
    };
    const ops = operationsFromOpenAPI(doc);
    expect(ops).toHaveLength(1);
    expect(ops[0].requestBodyContentType).toBe("multipart/form-data");
  });

  it("extracts operations from a minimal OpenAPI 3 doc", () => {
    const doc = {
      openapi: "3.0.0",
      info: { title: "Petstore", version: "1" },
      servers: [{ url: "https://api.example.com" }],
      paths: {
        "/pets": {
          get: {
            operationId: "listPets",
            parameters: [
              {
                name: "limit",
                in: "query",
                required: false,
                schema: { type: "integer" },
              },
            ],
            responses: { "200": { description: "ok" } },
          },
        },
      },
      components: { schemas: {} },
    };
    const ops = operationsFromOpenAPI(doc);
    expect(ops.length).toBe(1);
    expect(ops[0].id).toBe("listPets");
    expect(ops[0].method).toBe("GET");
    expect(ops[0].parameters.limit?.location).toBe("query");
  });
});

describe("sanitizeOpenAPIDocument", () => {
  it("renames 4xx/5xx response keys to 4XX/5XX for oas-validator", () => {
    const doc: OpenAPIDoc = {
      openapi: "3.0.3",
      info: { title: "t", version: "1" },
      paths: {
        "/x": {
          get: {
            responses: {
              "4xx": { description: "client error" },
              "5xx": { description: "server error" },
              "200": { description: "ok" },
            },
          },
        },
      },
      components: { schemas: {} },
    };
    const out = sanitizeOpenAPIDocument(doc);
    const responses = (out.paths["/x"] as Record<string, unknown>).get as {
      responses: Record<string, unknown>;
    };
    expect(responses.responses["4XX"]).toBeDefined();
    expect(responses.responses["5XX"]).toBeDefined();
    expect(responses.responses["4xx"]).toBeUndefined();
    expect(responses.responses["5xx"]).toBeUndefined();
  });

  it("injects a stub security scheme when referenced but missing (Cloudflare)", () => {
    const doc: OpenAPIDoc = {
      openapi: "3.0.3",
      info: { title: "t", version: "1" },
      paths: {
        "/upload": {
          post: {
            security: [{ assets_jwt: [] }],
            responses: { "200": { description: "ok" } },
          },
        },
      },
      components: {
        schemas: {},
        securitySchemes: {
          api_token: { type: "http", scheme: "bearer" },
        },
      },
    };
    const out = sanitizeOpenAPIDocument(doc);
    expect(out.components.securitySchemes?.assets_jwt).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
  });
});

describe("sanitizeOpenAPIObject", () => {
  it("adds nullable when default is null (Jira / oas-validator interop)", () => {
    const out = sanitizeOpenAPIObject({
      schema: {
        type: "array",
        items: { default: null, type: "string" },
      },
    }) as Record<string, unknown>;
    const items = (out.schema as Record<string, unknown>).items as Record<string, unknown>;
    expect(items.nullable).toBe(true);
    expect(items.default).toBeNull();
  });

  it("normalizes shorthand items: string", () => {
    const out = sanitizeOpenAPIObject({
      schema: { type: "array", items: "string" },
    }) as Record<string, unknown>;
    const items = (out.schema as Record<string, unknown>).items as Record<string, unknown>;
    expect(items.type).toBe("string");
  });
});

describe("sanitizeSchemaNode", () => {
  it("removes Discovery-only metadata and non-standard any type", () => {
    const input = {
      id: "GoogleFoo",
      enumDescriptions: ["one", "two"],
      enumDeprecated: [false, true],
      type: "any",
      properties: {
        // Must not remove real object field named "id"
        id: { type: "string" },
      },
    };

    const out = sanitizeSchemaNode(input) as Record<string, unknown>;
    expect(out.id).toBeUndefined();
    expect(out.enumDescriptions).toBeUndefined();
    expect(out.enumDeprecated).toBeUndefined();
    expect(out.type).toBeUndefined();

    const properties = out.properties as Record<string, unknown>;
    expect(properties.id).toEqual({ type: "string" });
  });

  it("normalizes refs into valid JSON pointers", () => {
    const input = {
      a: { $ref: "MySchema" },
      b: { $ref: "#components/schemas/OtherSchema" },
      c: { $ref: "#/components/schemas/AlreadyValid" },
    };

    const out = sanitizeSchemaNode(input) as Record<string, unknown>;
    expect((out.a as Record<string, unknown>).$ref).toBe("#/components/schemas/MySchema");
    expect((out.b as Record<string, unknown>).$ref).toBe("#/components/schemas/OtherSchema");
    expect((out.c as Record<string, unknown>).$ref).toBe("#/components/schemas/AlreadyValid");
  });

  it("recursively sanitizes nested structures and arrays", () => {
    const input = {
      items: [
        {
          enumDescriptions: ["bad"],
          nested: { type: "any", $ref: "NestedType" },
        },
      ],
    };

    const out = sanitizeSchemaNode(input) as Record<string, unknown>;
    const first = (out.items as Array<Record<string, unknown>>)[0];
    expect(first.enumDescriptions).toBeUndefined();
    expect((first.nested as Record<string, unknown>).type).toBeUndefined();
    expect((first.nested as Record<string, unknown>).$ref).toBe("#/components/schemas/NestedType");
  });
});

describe("discoveryToOpenAPI", () => {
  it("builds a valid minimal OpenAPI shape from discovery inputs", () => {
    const operations: Operation[] = [
      {
        id: "run.projects.locations.services.get",
        method: "GET",
        path: "v2/{+name}",
        flatPath: "v2/projects/{projectsId}/locations/{locationsId}/services/{servicesId}",
        description: "Get service",
        resource: "services",
        parameters: {
          parent: {
            type: "string",
            location: "path",
            required: true,
            description: "Parent not present in flatPath",
          },
          region: {
            type: "string",
            location: "query",
            required: false,
            description: "Optional query",
          },
        },
        scopes: ["https://www.googleapis.com/auth/cloud-platform.read-only"],
        responseBody: "GoogleCloudRunV2Service",
      },
    ];

    const discoveryDoc = {
      rootUrl: "https://run.googleapis.com/",
      servicePath: "",
      resources: {},
      schemas: {
        GoogleCloudRunV2Service: {
          id: "GoogleCloudRunV2Service",
          type: "object",
          properties: {
            mode: {
              type: "string",
              enum: ["A", "B"],
              enumDescriptions: ["Alpha", "Beta"],
              enumDeprecated: [false, true],
            },
            metadata: { type: "any" },
            template: { $ref: "GoogleCloudRunV2RevisionTemplate" },
            id: { type: "string" },
          },
        },
      },
    };

    const openapi = discoveryToOpenAPI(discoveryDoc as never, operations);

    // Path conversion and parameter hygiene.
    const pathItem = (
      openapi.paths[
        "/v2/projects/{projectsId}/locations/{locationsId}/services/{servicesId}"
      ] as Record<string, unknown>
    ).get as Record<string, unknown>;
    const params = pathItem.parameters as Array<Record<string, unknown>>;

    expect(params.some((p) => p.name === "parent")).toBe(false);
    expect(params.some((p) => p.name === "region")).toBe(true);
    expect(params.some((p) => p.name === "projectsId")).toBe(true);
    expect(params.some((p) => p.name === "locationsId")).toBe(true);
    expect(params.some((p) => p.name === "servicesId")).toBe(true);

    // Security scheme + per-op security.
    const oauth2 = openapi.components.securitySchemes?.oauth2 as Record<string, unknown>;
    expect(oauth2.type).toBe("oauth2");
    expect(pathItem.security).toEqual([
      { oauth2: ["https://www.googleapis.com/auth/cloud-platform.read-only"] },
    ]);

    // Schema sanitization is applied.
    const serviceSchema = openapi.components.schemas.GoogleCloudRunV2Service as Record<
      string,
      unknown
    >;
    expect(serviceSchema.id).toBeUndefined();

    const properties = serviceSchema.properties as Record<string, unknown>;
    const mode = properties.mode as Record<string, unknown>;
    expect(mode.enumDescriptions).toBeUndefined();
    expect(mode.enumDeprecated).toBeUndefined();

    const metadata = properties.metadata as Record<string, unknown>;
    expect(metadata.type).toBeUndefined();

    const template = properties.template as Record<string, unknown>;
    expect(template.$ref).toBe("#/components/schemas/GoogleCloudRunV2RevisionTemplate");

    const idProperty = properties.id as Record<string, unknown>;
    expect(idProperty.type).toBe("string");
  });

  it("wires request and response body refs for POST operations", () => {
    const operations: Operation[] = [
      {
        id: "run.projects.locations.services.create",
        method: "POST",
        path: "v2/{+parent}/services",
        flatPath: "v2/projects/{projectsId}/locations/{locationsId}/services",
        description: "Create service",
        resource: "services",
        parameters: {
          parent: {
            type: "string",
            location: "path",
            required: true,
            description: "Aggregate parent placeholder",
          },
        },
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
        requestBody: "GoogleCloudRunV2CreateServiceRequest",
        responseBody: "GoogleLongrunningOperation",
      },
    ];

    const discoveryDoc = {
      rootUrl: "https://run.googleapis.com/",
      servicePath: "",
      resources: {},
      schemas: {
        GoogleCloudRunV2CreateServiceRequest: {
          type: "object",
          properties: {
            service: { $ref: "GoogleCloudRunV2Service" },
          },
        },
        GoogleLongrunningOperation: {
          type: "object",
          properties: {
            metadata: { type: "any" },
          },
        },
      },
    };

    const openapi = discoveryToOpenAPI(discoveryDoc as never, operations);
    const post = (
      openapi.paths["/v2/projects/{projectsId}/locations/{locationsId}/services"] as Record<
        string,
        unknown
      >
    ).post as Record<string, unknown>;

    expect(post.operationId).toBe("run_projects_locations_services_create");

    const requestBody = post.requestBody as Record<string, unknown>;
    const requestSchema = (
      (requestBody.content as Record<string, unknown>)["application/json"] as Record<
        string,
        unknown
      >
    ).schema as Record<string, unknown>;
    expect(requestSchema.$ref).toBe("#/components/schemas/GoogleCloudRunV2CreateServiceRequest");

    const responseSchema = (
      (
        ((post.responses as Record<string, unknown>)["200"] as Record<string, unknown>)
          .content as Record<string, unknown>
      )["application/json"] as Record<string, unknown>
    ).schema as Record<string, unknown>;
    expect(responseSchema.$ref).toBe("#/components/schemas/GoogleLongrunningOperation");

    // Ensure sanitization still applies in this path.
    const opSchema = openapi.components.schemas.GoogleLongrunningOperation as Record<
      string,
      unknown
    >;
    const metadata = (opSchema.properties as Record<string, unknown>).metadata as Record<
      string,
      unknown
    >;
    expect(metadata.type).toBeUndefined();

    // Parent should be removed since it is not in the converted flatPath.
    const params = post.parameters as Array<Record<string, unknown>>;
    expect(params.some((p) => p.name === "parent")).toBe(false);
    expect(params.some((p) => p.name === "projectsId")).toBe(true);
    expect(params.some((p) => p.name === "locationsId")).toBe(true);
  });
});

describe("resolveBundledSelfHostedBaseUrl / resolveApiBaseUrl", () => {
  const minimal: OpenAPIDoc = {
    openapi: "3.0.3",
    info: { title: "x", version: "1" },
    servers: [{ url: "http://from-spec:9999" }],
    paths: {},
    components: { schemas: {} },
  };

  afterEach(() => {
    delete process.env.PAPERLESS_BASE_URL;
    delete process.env.ONYX_BASE_URL;
    delete process.env.TIKA_BASE_URL;
    delete process.env.CLAWQL_API_BASE_URL;
    delete process.env.API_BASE_URL;
    delete process.env.CLAWQL_PROVIDER;
  });

  it("returns per-label base URL from env", () => {
    process.env.PAPERLESS_BASE_URL = "http://paperless.local:8000/";
    expect(resolveBundledSelfHostedBaseUrl("paperless")).toBe("http://paperless.local:8000");
    process.env.ONYX_BASE_URL = "http://onyx.local:8080/api/";
    expect(resolveBundledSelfHostedBaseUrl("onyx")).toBe("http://onyx.local:8080/api");
    expect(resolveBundledSelfHostedBaseUrl("tika")).toBeUndefined();
  });

  it("resolveApiBaseUrl prefers self-hosted env over servers and global override", () => {
    process.env.PAPERLESS_BASE_URL = "http://pl:8000";
    process.env.CLAWQL_API_BASE_URL = "http://wrong";
    expect(resolveApiBaseUrl(minimal, "paperless")).toBe("http://pl:8000");
  });

  it("resolveApiBaseUrl falls back to servers when no self-hosted env", () => {
    expect(resolveApiBaseUrl(minimal, "github")).toBe("http://from-spec:9999");
  });

  it("resolveApiBaseUrlForOperation uses CLAWQL_PROVIDER when specLabel is unset", () => {
    process.env.CLAWQL_PROVIDER = "paperless";
    process.env.PAPERLESS_BASE_URL = "http://pl:8000";
    expect(resolveApiBaseUrlForOperation(minimal, {})).toBe("http://pl:8000");
  });
});
