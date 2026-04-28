import { buildSchema, introspectionFromSchema } from "graphql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node-fetch", () => ({
  default: vi.fn(),
}));

import fetch from "node-fetch";
import { loadSpec, resetSpecCache } from "./spec-loader.js";

describe("spec-loader native-protocol-only", () => {
  const keysToClear = [
    "CLAWQL_PROVIDER",
    "CLAWQL_SPEC_PATH",
    "CLAWQL_SPEC_URL",
    "CLAWQL_DISCOVERY_URL",
    "CLAWQL_SPEC_PATHS",
    "CLAWQL_BUNDLED_PROVIDERS",
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

  it("loads only GraphQL operations when CLAWQL_GRAPHQL_URL is set without OpenAPI spec env", async () => {
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
