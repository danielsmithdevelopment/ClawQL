import { describe, expect, it } from "vitest";
import { buildBootstrapUserData, buildGcpStartupScript } from "./user-data.js";

describe("buildBootstrapUserData", () => {
  it("emits bucket, prefix, provider, and bootstrap script", () => {
    const script = buildBootstrapUserData({
      bucket: "acme-team",
      prefix: "shared/",
      syncProvider: "r2",
    });

    expect(script).toMatch(/^#!\/bin\/bash/);
    expect(script).toContain('export CLAWQL_SYNC_BUCKET="acme-team"');
    expect(script).toContain('export CLAWQL_SYNC_PREFIX="shared/"');
    expect(script).toContain('export CLAWQL_SYNC_PROVIDER="r2"');
    expect(script).toContain("exec /usr/local/bin/bootstrap-team-vault.sh");
    expect(script).not.toContain("SSM_PREFIX");
  });

  it("includes SSM credential fetch when ssmParameterPrefix is set", () => {
    const script = buildBootstrapUserData({
      bucket: "acme-team",
      prefix: "tenant/acme/",
      syncProvider: "s3",
      ssmParameterPrefix: "/clawql/tenants/acme/sync",
    });

    expect(script).toContain('SSM_PREFIX="/clawql/tenants/acme/sync"');
    expect(script).toContain("aws ssm get-parameter");
    expect(script).toContain("CLAWQL_SYNC_ACCESS_KEY_ID");
  });

  it("escapes shell metacharacters in values", () => {
    const script = buildBootstrapUserData({
      bucket: 'bucket"with$quotes',
      prefix: "shared/",
      syncProvider: "r2",
    });

    expect(script).toContain('export CLAWQL_SYNC_BUCKET="bucket\\"with\\$quotes"');
  });
});

describe("buildGcpStartupScript", () => {
  it("matches AWS user-data bash", () => {
    const opts = { bucket: "gcs-bucket", prefix: "shared/", syncProvider: "gcs" as const };
    expect(buildGcpStartupScript(opts)).toBe(buildBootstrapUserData(opts));
  });
});
