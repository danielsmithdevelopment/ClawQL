import { describe, expect, it } from "vitest";
import { extractPresentedApiKey, validateVirtualKey } from "./validate.js";
import { resetRateLimitState } from "./rate-limit.js";

describe("validateVirtualKey", () => {
  it("extracts bearer and x-api-key headers", () => {
    expect(extractPresentedApiKey({ authorization: "Bearer sk-test" })).toBe("sk-test");
    expect(extractPresentedApiKey({ "x-api-key": "sk-header" })).toBe("sk-header");
  });

  it("rejects missing keys when enforcement is on", async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { createVirtualKey } = await import("./store.js");

    const dir = await mkdtemp(join(tmpdir(), "clawql-validate-"));
    const env = { CLAWQL_HOME: dir, CLAWQL_INFERENCE_KEYS_ENABLED: "1" };
    const created = await createVirtualKey({ team: "eng" }, env);

    expect(validateVirtualKey(undefined, env).ok).toBe(false);
    expect(validateVirtualKey("wrong", env).ok).toBe(false);

    const ok = validateVirtualKey(created.secret, env);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.context.team).toBe("eng");
    }
  });

  it("rejects when rate limit exceeded", async () => {
    resetRateLimitState();
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { createVirtualKey } = await import("./store.js");

    const dir = await mkdtemp(join(tmpdir(), "clawql-rl-"));
    const env = { CLAWQL_HOME: dir, CLAWQL_INFERENCE_KEYS_ENABLED: "1" };
    const created = await createVirtualKey({ team: "eng", rateLimit: "1rpm" }, env);

    expect(validateVirtualKey(created.secret, env).ok).toBe(true);
    const blocked = validateVirtualKey(created.secret, env);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.status).toBe(429);
  });
});
