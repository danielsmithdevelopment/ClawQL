import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from "graphql";
import type { Operation } from "./operation-types.js";

type Mode = "success" | "build-fail" | "missing-field" | "resolver-error";
let mode: Mode = "success";

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
      // Matches operationIdToRunStyleName(op)
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

mock.module("./graphql-schema-builder.js", () => ({
  buildGraphQLSchema: async () => {
    if (mode === "build-fail") {
      throw new Error("schema build failed");
    }
    if (mode === "missing-field") {
      return { schema: makeMissingFieldSchema(), contextValue: {} };
    }
    if (mode === "resolver-error") {
      return { schema: makeResolverErrorSchema(), contextValue: {} };
    }
    return { schema: makeSuccessSchema(), contextValue: {} };
  },
}));

const subjectPromise = import("./graphql-in-process-execute.js");

const op: Operation = {
  id: "run.projects.locations.services.get",
  method: "GET",
  path: "v2/projects/{projectsId}/locations/{locationsId}/services/{servicesId}",
  flatPath:
    "v2/projects/{projectsId}/locations/{locationsId}/services/{servicesId}",
  description: "Get service",
  resource: "services",
  parameters: {
    projectsId: { type: "string", location: "path", required: true, description: "" },
  },
  scopes: [],
};

describe("graphql-in-process-execute", () => {
  beforeEach(() => {
    mode = "success";
  });

  it("returns ok=false when schema build fails", async () => {
    mode = "build-fail";
    const { executeOperationGraphQL } = await subjectPromise;
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
    mode = "missing-field";
    const { executeOperationGraphQL } = await subjectPromise;
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
    mode = "resolver-error";
    const { executeOperationGraphQL } = await subjectPromise;
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
    mode = "success";
    const { executeOperationGraphQL } = await subjectPromise;
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

