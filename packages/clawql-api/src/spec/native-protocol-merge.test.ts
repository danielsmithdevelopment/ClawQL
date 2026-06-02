import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as gqlLoader from "./graphql-native-loader.js";
import * as grpcLoader from "./grpc-native-loader.js";
import { mergeNativeProtocolOperations } from "./native-protocol-merge.js";
import type { OpenAPIDoc, LoadedSpec } from "./spec-loader.js";
import type { Operation } from "./operation-types.js";
import { resetNativeProtocolMetricsForTests } from "./native-protocol-metrics.js";

function minimalOpenapi(): OpenAPIDoc {
  return {
    openapi: "3.0.0",
    info: { title: "t", version: "1" },
    paths: {},
    components: { schemas: {} },
  };
}

function restOp(id: string): Operation {
  return {
    id,
    method: "GET",
    path: "/",
    flatPath: "/",
    description: "",
    resource: "",
    parameters: {},
    scopes: [],
  };
}

function gqlNativeOp(id: string, specLabel?: string): Operation {
  return {
    ...restOp(id),
    protocolKind: "graphql",
    specLabel,
    nativeGraphQL: {
      sourceLabel: "s",
      operationType: "query",
      fieldName: "x",
    },
  };
}

describe("mergeNativeProtocolOperations", () => {
  const gqlSpy = vi.spyOn(gqlLoader, "loadGraphqlNativeOperations");
  const grpcSpy = vi.spyOn(grpcLoader, "loadGrpcNativeOperations");

  beforeEach(() => {
    gqlSpy.mockReset();
    grpcSpy.mockReset();
    gqlSpy.mockResolvedValue([]);
    grpcSpy.mockResolvedValue([]);
    resetNativeProtocolMetricsForTests();
  });

  afterEach(() => {
    resetNativeProtocolMetricsForTests();
  });

  it("returns loaded unchanged when native loaders yield nothing", async () => {
    const loaded: LoadedSpec = {
      operations: [restOp("listPets")],
      rawSource: {},
      openapi: minimalOpenapi(),
    };
    const out = await mergeNativeProtocolOperations(loaded);
    expect(out.operations).toHaveLength(1);
    expect(out.operations[0]?.id).toBe("listPets");
  });

  it("appends native ops and rewrites id on collision", async () => {
    gqlSpy.mockResolvedValue([gqlNativeOp("listPets", "linear")]);
    const loaded: LoadedSpec = {
      operations: [restOp("listPets")],
      rawSource: {},
      openapi: minimalOpenapi(),
    };
    const out = await mergeNativeProtocolOperations(loaded);
    expect(out.operations.map((o) => o.id)).toEqual(["listPets", "linear::listPets"]);
    expect(out.operations[1]?.protocolKind).toBe("graphql");
  });

  it("appends native ops without rename when id is unique", async () => {
    grpcSpy.mockResolvedValue([
      {
        ...restOp("grpcOnly"),
        protocolKind: "grpc",
        nativeGrpc: { sourceLabel: "x", clientKey: "x::svc", rpcName: "Unary" },
      },
    ]);
    const loaded: LoadedSpec = {
      operations: [restOp("listPets")],
      rawSource: {},
      openapi: minimalOpenapi(),
    };
    const out = await mergeNativeProtocolOperations(loaded);
    expect(out.operations.map((o) => o.id)).toEqual(["listPets", "grpcOnly"]);
  });
});
