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

  it("honors CLAWQL_INFERENCE_VIRTUAL_KEYS_PATH override", async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { resolveVirtualKeysPath } = await import("./config.js");
    const { createVirtualKey } = await import("./store.js");

    const dir = await mkdtemp(join(tmpdir(), "clawql-vk-path-"));
    const customPath = join(dir, "custom-keys.json");
    const env = {
      CLAWQL_INFERENCE_VIRTUAL_KEYS_PATH: customPath,
      CLAWQL_INFERENCE_KEYS_ENABLED: "1",
    };
    expect(resolveVirtualKeysPath(env)).toBe(customPath);
    const created = await createVirtualKey({ team: "path-team" }, env);
    expect(validateVirtualKey(created.secret, env).ok).toBe(true);
  });
});
