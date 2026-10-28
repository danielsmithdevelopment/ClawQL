import { describe, expect, it } from "vitest";
import {
  openApiDeclaresIdempotencyCapable,
  openApiDeclaresLookupByReferenceCapable,
  operationsFromOpenAPI,
  type OpenAPIDocLike,
} from "./openapi-operations.js";

describe("openApiDeclaresIdempotencyCapable", () => {
  it("detects Idempotency-Key header parameter", () => {
    expect(
      openApiDeclaresIdempotencyCapable({
        parameters: [
          { name: "Idempotency-Key", in: "header", required: false, schema: { type: "string" } },
        ],
      })
    ).toBe(true);
  });

  it("detects x-clawql-idempotencyCapable extension", () => {
    expect(openApiDeclaresIdempotencyCapable({ "x-clawql-idempotencyCapable": true })).toBe(true);
  });

  it("is false without key or extension", () => {
    expect(
      openApiDeclaresIdempotencyCapable({
        parameters: [{ name: "limit", in: "query", schema: { type: "integer" } }],
      })
    ).toBe(false);
  });
});

describe("openApiDeclaresLookupByReferenceCapable", () => {
  it("detects x-clawql-lookupByReferenceCapable extension", () => {
    expect(
      openApiDeclaresLookupByReferenceCapable({ "x-clawql-lookupByReferenceCapable": true })
    ).toBe(true);
  });

  it("is false without the extension", () => {
    expect(openApiDeclaresLookupByReferenceCapable({})).toBe(false);
  });
});

describe("operationsFromOpenAPI riskHints.idempotencyCapable", () => {
  it("sets riskHints when the operation declares Idempotency-Key", () => {
    const doc: OpenAPIDocLike = {
      openapi: "3.0.3",
      info: { title: "t", version: "1" },
      paths: {
        "/v1/charges": {
          post: {
            operationId: "createCharge",
            parameters: [
              {
                name: "Idempotency-Key",
                in: "header",
                required: false,
                schema: { type: "string" },
              },
            ],
            responses: { "200": { description: "ok" } },
          },
        },
      },
    };
    const ops = operationsFromOpenAPI(doc);
    expect(ops).toHaveLength(1);
    expect(ops[0]?.riskHints?.idempotencyCapable).toBe(true);
  });

  it("sets lookupByReferenceCapable from OpenAPI extension", () => {
    const doc: OpenAPIDocLike = {
      openapi: "3.0.3",
      info: { title: "t", version: "1" },
      paths: {
        "/v1/charges": {
          post: {
            operationId: "createCharge",
            "x-clawql-lookupByReferenceCapable": true,
            responses: { "200": { description: "ok" } },
          },
        },
      },
    };
    const ops = operationsFromOpenAPI(doc);
    expect(ops[0]?.riskHints?.lookupByReferenceCapable).toBe(true);
  });
});
