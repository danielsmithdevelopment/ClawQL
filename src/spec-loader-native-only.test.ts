import { buildSchema, introspectionFromSchema } from "graphql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node-fetch", () => ({
  default: vi.fn(),
}));

import fetch from "node-fetch";
import { loadSpec, resetSpecCache } from "clawql-api";

describe("spec-loader custom providers only", () => {
  const keysToClear = [
    "CLAWQL_PROVIDER",
    "CLAWQL_SPEC_PATH",
    "CLAWQL_SPEC_URL",
    "CLAWQL_DISCOVERY_URL",
    "CLAWQL_SPEC_PATHS",
    "CLAWQL_BUNDLED_PROVIDERS",
    "CLAWQL_GRAPHQL_SOURCES",
  ] as const;

  beforeEach(() => {
    resetSpecCache();
    for (const k of keysToClear) {
      delete process.env[k];
    }
    process.env.CLAWQL_GRAPHQL_URL = "https://api.example.com/graphql";
  });

  afterEach(() => {
    delete process.env.CLAWQL_GRAPHQL_URL;
    vi.mocked(fetch).mockReset();
    resetSpecCache();
  });

  it("loads only the configured custom provider when CLAWQL_GRAPHQL_URL is set without CLAWQL_PROVIDER", async () => {
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
    expect(loaded.operations.some((o) => o.specLabel === "cloudflare")).toBe(false);
  });
});

describe("spec-loader bundled provider routing from custom env", () => {
  const keysToClear = [
    "CLAWQL_PROVIDER",
    "CLAWQL_SPEC_PATH",
    "CLAWQL_SPEC_URL",
    "CLAWQL_DISCOVERY_URL",
    "CLAWQL_SPEC_PATHS",
    "CLAWQL_BUNDLED_PROVIDERS",
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

  it(
    "routes Linear custom env with a missing schemaPath to bundled linear",
    async () => {
      process.env.CLAWQL_GRAPHQL_SOURCES = JSON.stringify([
        {
          name: "linear",
          endpoint: "https://api.linear.app/graphql",
          schemaPath: "/definitely/missing/linear.graphql",
        },
      ]);

      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      const loaded = await loadSpec();
      err.mockRestore();

      expect(String(loaded.rawSource["bundledGraphqlProvider"] ?? "")).toBe("linear");
      expect(loaded.operations.some((o) => o.resource === "viewer")).toBe(true);
      expect(loaded.operations.some((o) => o.specLabel === "cloudflare")).toBe(false);
    },
    180_000
  );
});
