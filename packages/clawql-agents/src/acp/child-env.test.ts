import { describe, expect, it } from "vitest";
import { filterAcpChildEnv } from "./child-env.js";

describe("filterAcpChildEnv (audit 5.05)", () => {
  it("strips gateway secrets and cloud credentials", () => {
    const filtered = filterAcpChildEnv({
      PATH: "/usr/bin",
      HOME: "/home/agent",
      CLAWQL_HOME: "/data/clawql",
      CLAWQL_OBSERVABILITY_API_KEY: "obs-secret",
      CLAWQL_NATS_TOKEN: "nats-secret",
      AWS_SECRET_ACCESS_KEY: "aws",
      OPENAI_API_KEY: "sk-ok",
      RANDOM_API_KEY: "drop-me",
      STRIPE_SECRET_KEY: "sk_live",
      CLAWQL_ENABLE_MEMORY: "1",
    });
    expect(filtered.PATH).toBe("/usr/bin");
    expect(filtered.CLAWQL_HOME).toBe("/data/clawql");
    expect(filtered.OPENAI_API_KEY).toBe("sk-ok");
    expect(filtered.CLAWQL_ENABLE_MEMORY).toBe("1");
    expect(filtered.CLAWQL_OBSERVABILITY_API_KEY).toBeUndefined();
    expect(filtered.CLAWQL_NATS_TOKEN).toBeUndefined();
    expect(filtered.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(filtered.RANDOM_API_KEY).toBeUndefined();
    expect(filtered.STRIPE_SECRET_KEY).toBeUndefined();
  });

  it("merges explicit extras after filtering", () => {
    const filtered = filterAcpChildEnv({ PATH: "/bin" }, { CUSTOM_FLAG: "1" });
    expect(filtered.PATH).toBe("/bin");
    expect(filtered.CUSTOM_FLAG).toBe("1");
  });
});
