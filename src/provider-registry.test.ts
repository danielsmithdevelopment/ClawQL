import { describe, expect, it } from "vitest";
import {
  listBundledProviderIds,
  resolveBundledProvider,
  resolveBundledProviderGroup,
} from "./provider-registry.js";

describe("provider-registry", () => {
  it("lists bundled provider ids", () => {
    const ids = listBundledProviderIds();
    expect(ids).toContain("google");
    expect(ids).toContain("jira");
    expect(ids).toContain("bitbucket");
    expect(ids).toContain("cloudflare");
    expect(ids).not.toContain("atlassian"); // group, not concrete provider
  });

  it("resolves bundled provider case-insensitively", () => {
    const p = resolveBundledProvider("GoOgLe");
    expect(p?.id).toBe("google");
    expect(p?.bundledSpecPath).toBe("providers/google/discovery.json");
  });

  it("returns undefined for unknown bundled provider", () => {
    expect(resolveBundledProvider("unknown-x")).toBeUndefined();
  });

  it("resolves atlassian group to jira + bitbucket", async () => {
    const items = await resolveBundledProviderGroup("atlassian");
    expect(items?.map((x) => x.label)).toEqual(["jira", "bitbucket"]);
    expect(items?.every((x) => x.abs.includes("/providers/atlassian/"))).toBe(true);
  });

  it("resolves google-top50 group from manifest", async () => {
    const items = await resolveBundledProviderGroup("google-top50");
    expect(items).toBeDefined();
    expect(items!.length).toBeGreaterThan(10);
    expect(items!.some((x) => x.label === "compute-v1")).toBe(true);
    expect(items!.some((x) => x.abs.endsWith("/providers/google/apis/compute-v1/discovery.json"))).toBe(
      true
    );
  });

  it("returns undefined for unknown group", async () => {
    await expect(resolveBundledProviderGroup("unknown-group")).resolves.toBeUndefined();
  });
});

