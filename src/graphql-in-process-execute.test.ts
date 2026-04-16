import { GraphQLNonNull, GraphQLObjectType, GraphQLSchema, GraphQLString } from "graphql";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Operation } from "./operation-types.js";

type Mode = "success" | "build-fail" | "missing-field" | "resolver-error";

const testCtx = vi.hoisted(() => {
  const state = { mode: "success" as Mode };

  function makeSuccessSchema(): GraphQLSchema {
    const ResultType = new GraphQLObjectType({
      name: "Result",
      fields: {
        name: { type: GraphQLString },
      },
    });

    const QueryType = new GraphQLObjectType({
      name: "Query",
      fields: {
        runProjectsLocationsServicesGet: {
          type: ResultType,
          args: {
            projectsId: { type: new GraphQLNonNull(GraphQLString) },
          },
          resolve: (_src, args) => ({ name: `svc-${args.projectsId}` }),
        },
      },
    });

    return new GraphQLSchema({ query: QueryType });
  }

  function makeMissingFieldSchema(): GraphQLSchema {
    const QueryType = new GraphQLObjectType({
      name: "Query",
      fields: {
        somethingElse: {
          type: GraphQLString,
          resolve: () => "x",
        },
      },
    });
    return new GraphQLSchema({ query: QueryType });
  }

  function makeResolverErrorSchema(): GraphQLSchema {
    const ResultType = new GraphQLObjectType({
      name: "Result",
      fields: {
        name: { type: GraphQLString },
      },
    });
    const QueryType = new GraphQLObjectType({
      name: "Query",
      fields: {
        runProjectsLocationsServicesGet: {
          type: ResultType,
          args: {
            projectsId: { type: new GraphQLNonNull(GraphQLString) },
          },
          resolve: () => {
            throw new Error("resolver exploded");
          },
        },
      },
    });
    return new GraphQLSchema({ query: QueryType });
  }

  return { state, makeSuccessSchema, makeMissingFieldSchema, makeResolverErrorSchema };
});

vi.mock("./graphql-schema-builder.js", () => ({
  buildGraphQLSchema: async () => {
    const mode = testCtx.state.mode;
    if (mode === "build-fail") {
      throw new Error("schema build failed");
    }
    if (mode === "missing-field") {
      return { schema: testCtx.makeMissingFieldSchema(), contextValue: {} };
    }
    if (mode === "resolver-error") {
      return { schema: testCtx.makeResolverErrorSchema(), contextValue: {} };
    }
    return { schema: testCtx.makeSuccessSchema(), contextValue: {} };
  },
}));

const op: Operation = {
  id: "run.projects.locations.services.get",
  method: "GET",
  path: "v2/projects/{projectsId}/locations/{locationsId}/services/{servicesId}",
  flatPath: "v2/projects/{projectsId}/locations/{locationsId}/services/{servicesId}",
  description: "Get service",
  resource: "services",
  parameters: {
    projectsId: { type: "string", location: "path", required: true, description: "" },
  },
  scopes: [],
};

describe("graphql-in-process-execute", () => {
  beforeEach(() => {
    testCtx.state.mode = "success";
  });

  it("returns ok=false when schema build fails", async () => {
    testCtx.state.mode = "build-fail";
    const { executeOperationGraphQL } = await import("./graphql-in-process-execute.js");
    const out = await executeOperationGraphQL(
      {},
      "http://example.com",
      op,
      { projectsId: "p1" },
      "name"
    );
    expect(out).toEqual({ ok: false, error: "schema build failed" });
  });

  it("returns ok=false when no GraphQL field matches operation", async () => {
    testCtx.state.mode = "missing-field";
    const { executeOperationGraphQL } = await import("./graphql-in-process-execute.js");
    const out = await executeOperationGraphQL(
      {},
      "http://example.com",
      op,
      { projectsId: "p1" },
      "name"
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toContain(
        'No GraphQL query field found for operation "run.projects.locations.services.get"'
      );
    }
  });

  it("returns ok=false when resolver throws", async () => {
    testCtx.state.mode = "resolver-error";
    const { executeOperationGraphQL } = await import("./graphql-in-process-execute.js");
    const out = await executeOperationGraphQL(
      {},
      "http://example.com",
      op,
      { projectsId: "p1" },
      "name"
    );
    expect(out).toEqual({ ok: false, error: "resolver exploded" });
  });

  it("returns root field data on success", async () => {
    testCtx.state.mode = "success";
    const { executeOperationGraphQL } = await import("./graphql-in-process-execute.js");
    const out = await executeOperationGraphQL(
      {},
      "http://example.com",
      op,
      { projectsId: "p1" },
      "name"
    );
    expect(out).toEqual({ ok: true, data: { name: "svc-p1" } });
  });
});
