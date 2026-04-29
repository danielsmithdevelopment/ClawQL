import { buildSchema } from "graphql";
import { describe, expect, it } from "vitest";
import {
  capturePathParams,
  discoveryTypeToGraphQL,
  normalizeArgsForField,
  operationIdToGraphQLName,
  operationIdToRunStyleName,
  resolveGraphQLFieldFromSchema,
} from "./graphql-execute-helpers.js";
import type { Operation } from "./operation-types.js";

function op(partial: Partial<Operation> & Pick<Operation, "id" | "flatPath">): Operation {
  return {
    method: "GET",
    path: "/",
    description: "",
    resource: "",
    parameters: {},
    scopes: [],
    ...partial,
  };
}

describe("graphql-execute-helpers", () => {
  it("operationIdToGraphQLName builds camel-ish name from flatPath and id suffix", () => {
    const o = op({
      id: "storage.objects.list",
      flatPath: "/storage/v1/b/{bucket}/o",
    });
    expect(operationIdToGraphQLName(o)).toMatch(/storage/);
    expect(operationIdToRunStyleName(o)).toContain("storage");
  });

  it("capturePathParams extracts brace segments", () => {
    expect(capturePathParams("/v1/{name}", "v1/my-object")).toEqual({ name: "my-object" });
    expect(capturePathParams("/v1/{a}/{b}", "v1/x/y")).toEqual({ a: "x", b: "y" });
    expect(capturePathParams("/v1/foo", "v1/bar")).toEqual({});
  });

  it("resolveGraphQLFieldFromSchema finds field by operation id", () => {
    const schema = buildSchema(`
      type Query {
        listPets: String
      }
    `);
    const o = op({ id: "listPets", flatPath: "/pets" });
    const r = resolveGraphQLFieldFromSchema(schema, o, "query");
    expect(r.fieldName).toBe("listPets");
    expect(Array.isArray(r.fieldArgs)).toBe(true);
  });

  it("normalizeArgsForField keeps only expected keys and fills path params from name", () => {
    const o = op({
      id: "pets.get",
      flatPath: "/pets/{petId}",
      parameters: {
        petId: { type: "string", required: true, location: "path", description: "" },
      },
    });
    const out = normalizeArgsForField(o, { name: "/pets/7", extra: "drop" }, ["petId", "name"]);
    expect(out).toEqual({ petId: "7", name: "/pets/7" });
  });

  it("discoveryTypeToGraphQL maps primitive types and required flag", () => {
    expect(discoveryTypeToGraphQL("string")).toBe("String");
    expect(discoveryTypeToGraphQL("integer", true)).toBe("Int!");
    expect(discoveryTypeToGraphQL("unknown")).toBe("String");
  });
});
