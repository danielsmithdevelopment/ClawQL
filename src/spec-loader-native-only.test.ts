import { buildSchema, introspectionFromSchema } from "graphql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node-fetch", () => ({
  default: vi.fn(),
}));

import fetch from "node-fetch";
import { loadSpec, resetSpecCache } from "clawql-api";

describe("spec-loader native-protocol-only", () => {
  const keysToClear = [
    "CLAWQL_PROVIDER",
    "CLAWQL_SPEC_PATH",
    "CLAWQL_SPEC_URL",
    "CLAWQL_DISCOVERY_URL",
    "CLAWQL_SPEC_PATHS",
    "CLAWQL_BUNDLED_PROVIDERS",
    "CLAWQL_NATIVE_PROTOCOLS_ONLY",
  ] as const;

  beforeEach(() => {
    resetSpecCache();
    for (const k of keysToClear) {
      delete process.env[k];
    }
    process.env.CLAWQL_GRAPHQL_URL = "https://api.example.com/graphql";
    process.env.CLAWQL_NATIVE_PROTOCOLS_ONLY = "1";
  });

  afterEach(() => {
    delete process.env.CLAWQL_GRAPHQL_URL;
    delete process.env.CLAWQL_NATIVE_PROTOCOLS_ONLY;
    vi.mocked(fetch).mockReset();
    resetSpecCache();
  });

  it("loads only GraphQL operations when CLAWQL_NATIVE_PROTOCOLS_ONLY=1 without OpenAPI spec env", async () => {
    const iq = introspectionFromSchema(
      buildSchema(`
      type Query { ping: String }
    `)
    );
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ data: iq }),
    } as unknown as Awaited<ReturnType<typeof fetch>>);

    const loaded = await loadSpec();
    expect(loaded.operations.some((o) => o.resource === "ping")).toBe(true);
    expect(loaded.rawSource).toMatchObject({ kind: "native-protocols-only" });
  });
});

describe("spec-loader native GraphQL env without native-only flag", () => {
  const keysToClear = [
    "CLAWQL_PROVIDER",
    "CLAWQL_SPEC_PATH",
    "CLAWQL_SPEC_URL",
    "CLAWQL_DISCOVERY_URL",
    "CLAWQL_SPEC_PATHS",
    "CLAWQL_BUNDLED_PROVIDERS",
    "CLAWQL_NATIVE_PROTOCOLS_ONLY",
    "CLAWQL_GRAPHQL_URL",
    "CLAWQL_GRAPHQL_SOURCES",
  ] as const;

  beforeEach(() => {
    resetSpecCache();
    for (const k of keysToClear) {
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of keysToClear) {
      delete process.env[k];
    }
    vi.mocked(fetch).mockReset();
    resetSpecCache();
  });

  it("falls back to bundled defaults when CLAWQL_GRAPHQL_SOURCES has a missing schemaPath", async () => {
    process.env.CLAWQL_GRAPHQL_SOURCES = JSON.stringify([
      {
        name: "linear",
        endpoint: "https://api.linear.app/graphql",
        schemaPath: "/definitely/missing/linear.graphql",
      },
    ]);
    vi.mocked(fetch).mockRejectedValue(new Error("introspection blocked"));

    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const loaded = await loadSpec();
    err.mockRestore();

    expect(loaded.rawSource).not.toMatchObject({ kind: "native-protocols-only" });
    expect(loaded.operations.length).toBeGreaterThan(0);
    expect(loaded.operations.some((o) => o.protocolKind !== "graphql")).toBe(true);
  }, 120_000);
});
