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
  let prevHome: string | undefined;
  let emptyHome: string;

  beforeEach(async () => {
    gqlSpy.mockReset();
    grpcSpy.mockReset();
    gqlSpy.mockResolvedValue([]);
    grpcSpy.mockResolvedValue([]);
    resetNativeProtocolMetricsForTests();
    prevHome = process.env.CLAWQL_HOME;
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    emptyHome = await mkdtemp(join(tmpdir(), "clawql-no-sources-"));
    process.env.CLAWQL_HOME = emptyHome;
  });

  afterEach(() => {
    resetNativeProtocolMetricsForTests();
    if (prevHome === undefined) delete process.env.CLAWQL_HOME;
    else process.env.CLAWQL_HOME = prevHome;
  });

  it("still merges custom CLI sources when native loaders yield nothing", async () => {
    const { writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await writeFile(
      join(emptyHome, "sources.json"),
      JSON.stringify({
        version: 1,
        sources: [
          {
            id: "fabric-event",
            kind: "cli",
            name: "Fabric",
            addedAt: new Date().toISOString(),
            cliCommand: "node",
            cliArgs: ["-e", "console.log(1)"],
          },
        ],
      }),
      "utf8"
    );
    const loaded: LoadedSpec = {
      operations: [restOp("listPets")],
      rawSource: {},
      openapi: minimalOpenapi(),
    };
    const out = await mergeNativeProtocolOperations(loaded);
    expect(out.operations.map((o) => o.id)).toContain("cli__fabric_event__run");
    expect(out.operations.map((o) => o.id)).toContain("listPets");
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
