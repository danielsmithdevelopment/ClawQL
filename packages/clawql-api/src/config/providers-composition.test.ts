import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isEmptyProvidersComposition,
  readProvidersCompositionFromEnv,
} from "./providers-composition.js";
import { loadSpec, resetSpecCache } from "../spec/spec-loader.js";

describe("providers composition", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetSpecCache();
  });

  it("treats pack none / empty enabled as empty", () => {
    expect(isEmptyProvidersComposition({})).toBe(true);
    expect(isEmptyProvidersComposition({ pack: "none" })).toBe(true);
    expect(isEmptyProvidersComposition({ pack: "none", enabled: [] })).toBe(true);
    expect(isEmptyProvidersComposition({ pack: "default" })).toBe(false);
    expect(isEmptyProvidersComposition({ enabled: ["github"] })).toBe(false);
  });

  it("reads providers from CLAWQL_INSTANCE_SPEC", () => {
    vi.stubEnv(
      "CLAWQL_INSTANCE_SPEC",
      JSON.stringify({ providers: { pack: "default", enabled: ["n8n"] } })
    );
    expect(readProvidersCompositionFromEnv()).toEqual({
      pack: "default",
      enabled: ["n8n"],
    });
  });

  it("loadSpec with no provider config yields empty operation index (native stub)", async () => {
    delete process.env.CLAWQL_PROVIDER;
    delete process.env.CLAWQL_BUNDLED_PROVIDERS;
    delete process.env.CLAWQL_SPEC_PATHS;
    delete process.env.CLAWQL_SPEC_PATH;
    delete process.env.CLAWQL_SPEC_URL;
    delete process.env.CLAWQL_DISCOVERY_URL;
    delete process.env.CLAWQL_INSTANCE_SPEC;
    delete process.env.CLAWQL_INSTANCE_SPEC_FILE;
    delete process.env.CLAWQL_GRAPHQL_URL;
    delete process.env.CLAWQL_GRAPHQL_SOURCES;
    delete process.env.CLAWQL_GRPC_SOURCES;
    vi.stubEnv("CLAWQL_BUNDLED_OFFLINE", "1");
    resetSpecCache();

    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const loaded = await loadSpec();
    expect(loaded.operations).toHaveLength(0);
    expect((loaded.rawSource as { stub?: boolean }).stub).toBe(true);
    expect(err.mock.calls.some((c) => String(c[0]).includes("BREAKING (8.0.0)"))).toBe(true);
    err.mockRestore();
  });

  it("loadSpec honors instance providers.enabled for a single vendor", async () => {
    vi.stubEnv("CLAWQL_BUNDLED_OFFLINE", "1");
    vi.stubEnv("CLAWQL_INSTANCE_SPEC", JSON.stringify({ providers: { enabled: ["linear"] } }));
    delete process.env.CLAWQL_PROVIDER;
    delete process.env.CLAWQL_BUNDLED_PROVIDERS;
    resetSpecCache();

    const loaded = await loadSpec();
    const labels = new Set(
      loaded.operations.map((op) => op.specLabel).filter((x): x is string => Boolean(x))
    );
    expect(labels.has("linear")).toBe(true);
    expect(labels.has("github")).toBe(false);
    expect(loaded.operations.length).toBeGreaterThan(0);
  }, 60_000);
});
