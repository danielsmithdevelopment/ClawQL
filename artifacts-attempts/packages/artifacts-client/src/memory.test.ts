import { describe, expect, it } from "vitest";
import { createMemoryClient } from "./index.js";

describe("createMemoryClient", () => {
  it("forks and mints repo-scoped tokens", async () => {
    const c = createMemoryClient();
    await c.create("webhooks");
    const fork = await c.fork("webhooks", "tsk_1-att_1");
    expect(fork.name).toBe("tsk_1-att_1");
    const tok = await c.createToken("tsk_1-att_1", "write", 900);
    expect(tok.plaintext).toContain("tsk_1-att_1");
    expect(tok.scope).toBe("write");
    expect(await c.list()).toContain("tsk_1-att_1");
  });
});
