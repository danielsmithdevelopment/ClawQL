import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSchema, introspectionFromSchema, type IntrospectionQuery } from "graphql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node-fetch", () => ({
  default: vi.fn(),
}));

import fetch from "node-fetch";
import {
  introspectionJsonToQuery,
  loadGraphqlNativeOperationsFromConfigs,
} from "./graphql-native-loader.js";
import { resetNativeProtocolRegistry } from "./native-protocol-registry.js";

describe("graphql-native-loader", () => {
  beforeEach(() => {
    resetNativeProtocolRegistry();
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetNativeProtocolRegistry();
  });

  it("loads Query fields from HTTP introspection and registers the endpoint", async () => {
    const iq = introspectionFromSchema(
      buildSchema(`
      type Query {
        ping: String
        version: Int!
      }
    `)
    );
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ data: iq }),
    } as unknown as Awaited<ReturnType<typeof fetch>>);

    const ops = await loadGraphqlNativeOperationsFromConfigs([
      { name: "demo", endpoint: "http://127.0.0.1:9/graphql" },
    ]);

    const ping = ops.find((o) => o.resource === "ping");
    expect(ping?.protocolKind).toBe("graphql");
    expect(ping?.nativeGraphQL?.operationType).toBe("query");
    expect(ping?.id).toContain("graphql");
    expect(ops.some((o) => o.resource === "version")).toBe(true);
  });

  it("loads Query fields from SDL on disk (no HTTP introspection)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gql-native-sdl-"));
    try {
      const sdlPath = join(dir, "schema.graphql");
      writeFileSync(sdlPath, `type Query { pingDisk: String versionDisk: Int! }`, "utf-8");
      const ops = await loadGraphqlNativeOperationsFromConfigs([
        { name: "demo", endpoint: "http://127.0.0.1:9/graphql", schemaPath: sdlPath },
      ]);

      expect(fetch).not.toHaveBeenCalled();
      expect(ops.find((o) => o.resource === "pingDisk")).toMatchObject({
        protocolKind: "graphql",
        nativeGraphQL: { operationType: "query", fieldName: "pingDisk" },
      });
      expect(ops.some((o) => o.resource === "versionDisk")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads from saved introspection JSON ({ data }) without HTTP", async () => {
    const iq = introspectionFromSchema(buildSchema(`type Query { fromJson: String }`));
    const dir = mkdtempSync(join(tmpdir(), "gql-native-intro-"));
    try {
      const p = join(dir, "intro.json");
      writeFileSync(p, JSON.stringify({ data: iq }), "utf-8");
      const ops = await loadGraphqlNativeOperationsFromConfigs([
        { name: "demo", endpoint: "http://127.0.0.1:9/graphql", introspectionPath: p },
      ]);
      expect(fetch).not.toHaveBeenCalled();
      expect(ops.find((o) => o.resource === "fromJson")).toBeDefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads Query fields from inline schemaContent (no path)", async () => {
    const ops = await loadGraphqlNativeOperationsFromConfigs([
      {
        name: "inline",
        endpoint: "http://127.0.0.1:9/graphql",
        schemaContent: "type Query { inlineField: String }",
      },
    ]);
    expect(fetch).not.toHaveBeenCalled();
    expect(ops.find((o) => o.resource === "inlineField")).toBeDefined();
  });

  it("prefers introspectionPath over schemaPath when both set", async () => {
    const iq = introspectionFromSchema(buildSchema(`type Query { winner: String }`));
    const dir = mkdtempSync(join(tmpdir(), "gql-native-both-"));
    try {
      const intro = join(dir, "i.json");
      const sdl = join(dir, "s.graphql");
      writeFileSync(intro, JSON.stringify(iq), "utf-8");
      writeFileSync(sdl, `type Query { loser: String }`, "utf-8");
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      const ops = await loadGraphqlNativeOperationsFromConfigs([
        {
          name: "demo",
          endpoint: "http://127.0.0.1:9/graphql",
          introspectionPath: intro,
          schemaPath: sdl,
        },
      ]);
      err.mockRestore();
      expect(ops.some((o) => o.resource === "winner")).toBe(true);
      expect(ops.some((o) => o.resource === "loser")).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("introspectionJsonToQuery", () => {
  it("accepts HTTP body { data: IntrospectionQuery }", () => {
    const inner = { __schema: { queryType: null } } as unknown as IntrospectionQuery;
    expect(introspectionJsonToQuery({ data: inner })).toBe(inner);
  });

  it("accepts bare IntrospectionQuery", () => {
    const q = { __schema: { queryType: null } } as unknown as IntrospectionQuery;
    expect(introspectionJsonToQuery(q)).toBe(q);
  });

  it("rejects invalid shapes", () => {
    expect(() => introspectionJsonToQuery({})).toThrow(/expected/);
  });
});
