import { describe, expect, it } from "vitest";
import { defaultProfileForCloud, parseProvisionProfile } from "./profiles.js";
import { buildK3sBootstrapUserData } from "./k3s-user-data.js";

describe("parseProvisionProfile", () => {
  it("defaults to golden-host", () => {
    expect(parseProvisionProfile(undefined)).toBe("golden-host");
  });

  it("accepts edge / idp-k3s / eks", () => {
    expect(parseProvisionProfile("edge")).toBe("edge");
    expect(parseProvisionProfile("idp-k3s")).toBe("idp-k3s");
    expect(parseProvisionProfile("eks")).toBe("eks");
  });

  it("rejects unknown profiles", () => {
    expect(() => parseProvisionProfile("terraform")).toThrow(/Invalid profile/);
  });
});

describe("defaultProfileForCloud", () => {
  it("maps cloudflare → team-vault and aws/gcp → golden-host", () => {
    expect(defaultProfileForCloud("cloudflare")).toBe("team-vault");
    expect(defaultProfileForCloud("aws")).toBe("golden-host");
    expect(defaultProfileForCloud("gcp")).toBe("golden-host");
  });
});

describe("buildK3sBootstrapUserData", () => {
  it("installs k3s without traefik and writes next steps", () => {
    const script = buildK3sBootstrapUserData({
      nodeName: "clawql-idp-acme",
      r2Bucket: "clawql-vault-prod",
      gitopsRepoUrl: "https://github.com/danielsmithdevelopment/ClawQL.git",
    });
    expect(script).toContain("get.k3s.io");
    expect(script).toContain("--disable traefik");
    expect(script).toContain("clawql-idp-acme");
    expect(script).toContain("CLAWQL_R2_BUCKET=clawql-vault-prod");
    expect(script).toContain("deployment/gitops");
    expect(script).toContain("NEXT_STEPS.txt");
  });
});
