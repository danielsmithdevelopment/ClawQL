import { describe, expect, it } from "vitest";
import { resolveVaultPropertyId } from "./secrets.js";

describe("resolveVaultPropertyId", () => {
  it("resolves short aliases", () => {
    expect(resolveVaultPropertyId("github")).toBe("githubToken");
    expect(resolveVaultPropertyId("linear")).toBe("linearApiKey");
    expect(resolveVaultPropertyId("slack")).toBe("slackToken");
  });

  it("resolves vault property names", () => {
    expect(resolveVaultPropertyId("githubToken")).toBe("githubToken");
    expect(resolveVaultPropertyId("notionApiToken")).toBe("notionApiToken");
  });

  it("returns undefined for unknown ids", () => {
    expect(resolveVaultPropertyId("not-a-provider")).toBeUndefined();
  });
});
