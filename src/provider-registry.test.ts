import { describe, expect, it, vi } from "vitest";
import {
  BUNDLED_DOCUMENT_VENDOR_IDS,
  listBundledProviderGroupIds,
  listBundledProviderIds,
  resolveBundledProvider,
  resolveBundledProviderGroup,
  resolveItemsFromBundledProviderEnvList,
} from "./provider-registry.js";

describe("provider-registry", () => {
  it("lists bundled provider ids", () => {
    const ids = listBundledProviderIds();
    expect(ids).toContain("jira");
    expect(ids).toContain("bitbucket");
    expect(ids).toContain("cloudflare");
    expect(ids).toContain("tika");
    expect(ids).toContain("gotenberg");
    expect(ids).toContain("paperless");
    expect(ids).toContain("stirling");
    expect(ids).toContain("onyx");
    expect(ids).not.toContain("atlassian"); // group, not concrete provider
  });

  it("resolves bundled provider case-insensitively", () => {
    const p = resolveBundledProvider("JiRa");
    expect(p?.id).toBe("jira");
    expect(p?.bundledSpecPath).toContain("atlassian/jira");
  });

  it("lists merged preset ids including google (not google-top50)", () => {
    const groups = listBundledProviderGroupIds();
    expect(groups).toContain("google");
    expect(groups).not.toContain("google-top50");
  });

  it("returns undefined for unknown bundled provider", () => {
    expect(resolveBundledProvider("unknown-x")).toBeUndefined();
  });

  it("resolves atlassian group to jira + bitbucket", async () => {
    const items = await resolveBundledProviderGroup("atlassian");
    expect(items?.map((x) => x.label)).toEqual(["jira", "bitbucket"]);
    expect(items?.every((x) => x.abs.includes("/providers/atlassian/"))).toBe(true);
  });

  it("resolves google merged group from manifest", async () => {
    const items = await resolveBundledProviderGroup("google");
    expect(items).toBeDefined();
    expect(items!.length).toBeGreaterThan(10);
    expect(items!.some((x) => x.label === "compute-v1")).toBe(true);
    expect(
      items!.some((x) => x.abs.endsWith("/providers/google/apis/compute-v1/discovery.json"))
    ).toBe(true);
  });

  it("accepts deprecated google-top50 alias for the google merged group", async () => {
    const canonical = await resolveBundledProviderGroup("google");
    const alias = await resolveBundledProviderGroup("google-top50");
    expect(alias?.length).toBe(canonical?.length);
  });

  it("returns undefined for unknown group", async () => {
    await expect(resolveBundledProviderGroup("unknown-group")).resolves.toBeUndefined();
  });

  it("rejects removed default-multi-provider preset with a clear error", async () => {
    await expect(resolveBundledProviderGroup("default-multi-provider")).rejects.toThrow(
      /default-multi-provider merge was removed/
    );
  });

  it("resolves all-providers to many bundled vendors", async () => {
    const items = await resolveBundledProviderGroup("all-providers");
    expect(items).toBeDefined();
    expect(items!.length).toBeGreaterThan(20);
    const labels = new Set(items!.map((x) => x.label));
    expect(labels.has("slack")).toBe(true);
    expect(labels.has("n8n")).toBe(true);
    expect(labels.has("github")).toBe(true);
    expect(labels.has("paperless")).toBe(true);
    expect(labels.has("tika")).toBe(true);
    expect(labels.has("onyx")).toBe(true);
    expect(items!.every((x) => x.abs.includes("/providers/"))).toBe(true);
  });

  it("omits document-stack vendors from all-providers when CLAWQL_ENABLE_DOCUMENTS=0", async () => {
    vi.stubEnv("CLAWQL_ENABLE_DOCUMENTS", "0");
    try {
      const items = await resolveBundledProviderGroup("all-providers");
      expect(items).toBeDefined();
      const labels = new Set(items!.map((x) => x.label));
      for (const id of BUNDLED_DOCUMENT_VENDOR_IDS) {
        expect(labels.has(id)).toBe(false);
      }
      expect(labels.has("github")).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("resolveItemsFromBundledProviderEnvList merges listed vendors and google", async () => {
    const items = await resolveItemsFromBundledProviderEnvList("github, n8n");
    const labels = new Set(items.map((x) => x.label));
    expect(labels.has("github")).toBe(true);
    expect(labels.has("n8n")).toBe(true);
    expect(labels.has("compute-v1")).toBe(false);
  });

  it("resolveItemsFromBundledProviderEnvList with google includes Discovery slugs", async () => {
    const items = await resolveItemsFromBundledProviderEnvList("github,google");
    const labels = new Set(items.map((x) => x.label));
    expect(labels.has("github")).toBe(true);
    expect(labels.has("compute-v1")).toBe(true);
  });

  it("CLAWQL_BUNDLED_PROVIDERS still includes paperless when CLAWQL_ENABLE_DOCUMENTS=0 (explicit list)", async () => {
    vi.stubEnv("CLAWQL_ENABLE_DOCUMENTS", "0");
    try {
      const items = await resolveItemsFromBundledProviderEnvList("paperless,github");
      const labels = new Set(items.map((x) => x.label));
      expect(labels.has("paperless")).toBe(true);
      expect(labels.has("github")).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("resolveItemsFromBundledProviderEnvList rejects unknown id", async () => {
    await expect(resolveItemsFromBundledProviderEnvList("not-a-vendor-x")).rejects.toThrow(
      /Unknown id "not-a-vendor-x" in CLAWQL_BUNDLED_PROVIDERS/
    );
  });
});
