import { describe, expect, it, vi } from "vitest";
import {
  BUNDLED_DOCUMENT_VENDOR_IDS,
  listBundledProviderGroupIds,
  listBundledProviderIds,
  resolveBundledProvider,
  resolveBundledProviderGroup,
  resolveDefaultBundledProvidersItems,
  resolveItemsFromBundledProviderEnvList,
} from "clawql-api";

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
    expect(ids).toContain("linear");
    expect(ids).not.toContain("atlassian"); // group, not concrete provider
  });

  it("resolves bundled provider case-insensitively", () => {
    const p = resolveBundledProvider("JiRa");
    expect(p?.id).toBe("jira");
    expect(p && "bundledSpecPath" in p ? p.bundledSpecPath : "").toContain("atlassian/jira");
  });

  it("resolves linear as GraphQL-only bundled provider", () => {
    const p = resolveBundledProvider("linear");
    expect(p?.id).toBe("linear");
    expect(p?.format).toBe("graphql");
    expect(p && "graphqlEndpoint" in p ? p.graphqlEndpoint : "").toContain("api.linear.app");
  });

  it("lists merged preset ids including google (not google-top50)", () => {
    const groups = listBundledProviderGroupIds();
    expect(groups).toContain("google");
    expect(groups).toContain("aws");
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

  it("resolves aws merged group from manifest", async () => {
    const items = await resolveBundledProviderGroup("aws");
    expect(items).toBeDefined();
    expect(items!.length).toBe(50);
    expect(items!.some((x) => x.label === "ec2-2016-11-15")).toBe(true);
    expect(
      items!.some((x) => x.abs.endsWith("/providers/aws/apis/ec2-2016-11-15/openapi.yaml"))
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
    expect(items!.length).toBeGreaterThan(8);
    const labels = new Set(items!.map((x) => x.label));
    expect(labels.has("slack")).toBe(true);
    expect(labels.has("n8n")).toBe(true);
    expect(labels.has("github")).toBe(true);
    expect(labels.has("paperless")).toBe(true);
    expect(labels.has("tika")).toBe(true);
    expect(labels.has("onyx")).toBe(true);
    expect(labels.has("linear")).toBe(true);
    expect(labels.has("cloudflare")).toBe(true);
    // Google/AWS off by default unless CLAWQL_ENABLE_GOOGLE / CLAWQL_ENABLE_AWS is set
    expect(labels.has("ec2-2016-11-15")).toBe(false);
    expect(labels.has("compute-v1")).toBe(false);
    expect(
      items!.every((x) =>
        x.kind === "graphql" ? x.schemaAbs.includes("/providers/") : x.abs.includes("/providers/")
      )
    ).toBe(true);
  });

  it("includes google and aws in all-providers when CLAWQL_ENABLE_GOOGLE and CLAWQL_ENABLE_AWS are set", async () => {
    vi.stubEnv("CLAWQL_ENABLE_GOOGLE", "1");
    vi.stubEnv("CLAWQL_ENABLE_AWS", "1");
    try {
      const items = await resolveBundledProviderGroup("all-providers");
      const labels = new Set(items!.map((x) => x.label));
      expect(labels.has("compute-v1")).toBe(true);
      expect(labels.has("ec2-2016-11-15")).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("omits cloudflare from all-providers when CLAWQL_ENABLE_CLOUDFLARE=0", async () => {
    vi.stubEnv("CLAWQL_ENABLE_CLOUDFLARE", "0");
    try {
      const items = await resolveBundledProviderGroup("all-providers");
      const labels = new Set(items!.map((x) => x.label));
      expect(labels.has("cloudflare")).toBe(false);
      expect(labels.has("github")).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
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

  it("resolveItemsFromBundledProviderEnvList with aws includes service slugs", async () => {
    const items = await resolveItemsFromBundledProviderEnvList("github,aws");
    const labels = new Set(items.map((x) => x.label));
    expect(labels.has("github")).toBe(true);
    expect(labels.has("sts-2011-06-15")).toBe(true);
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

  it("resolveItemsFromBundledProviderEnvList includes linear as graphql item", async () => {
    const items = await resolveItemsFromBundledProviderEnvList("linear");
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("graphql");
    if (items[0]?.kind === "graphql") {
      expect(items[0].label).toBe("linear");
      expect(items[0].endpoint).toContain("linear.app");
    }
  });

  it("resolveDefaultBundledProvidersItems loads cloudflare only by default", async () => {
    vi.stubEnv("CLAWQL_ENABLE_GOOGLE", "0");
    vi.stubEnv("CLAWQL_ENABLE_AWS", "0");
    delete process.env.CLAWQL_ENABLE_CLOUDFLARE;
    try {
      const items = await resolveDefaultBundledProvidersItems();
      const labels = new Set(items.map((x) => x.label));
      expect(labels).toEqual(new Set(["cloudflare"]));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("resolveDefaultBundledProvidersItems respects CLAWQL_ENABLE_GOOGLE and CLAWQL_ENABLE_AWS", async () => {
    vi.stubEnv("CLAWQL_ENABLE_GOOGLE", "1");
    vi.stubEnv("CLAWQL_ENABLE_AWS", "1");
    vi.stubEnv("CLAWQL_ENABLE_CLOUDFLARE", "0");
    try {
      const items = await resolveDefaultBundledProvidersItems();
      const labels = new Set(items.map((x) => x.label));
      expect(labels.has("cloudflare")).toBe(false);
      expect(labels.has("compute-v1")).toBe(true);
      expect(labels.has("sts-2011-06-15")).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
