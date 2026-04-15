import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callSandboxBridge, handleClawqlCodeToolInput } from "./sandbox-bridge-client.js";

describe("sandbox-bridge-client", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.CLAWQL_SANDBOX_BRIDGE_URL = process.env.CLAWQL_SANDBOX_BRIDGE_URL;
    saved.CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN = process.env.CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN;
    delete process.env.CLAWQL_SANDBOX_BRIDGE_URL;
    delete process.env.CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of Object.keys(saved)) {
      const v = saved[key as keyof typeof saved];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  });

  it("callSandboxBridge errors when bridge URL missing", async () => {
    const r = await callSandboxBridge({ code: "x", language: "python" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/CLAWQL_SANDBOX_BRIDGE_URL/);
  });

  it("callSandboxBridge errors when token missing", async () => {
    process.env.CLAWQL_SANDBOX_BRIDGE_URL = "https://bridge.example.test";
    const r = await callSandboxBridge({ code: "x", language: "python" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN/);
  });

  it("callSandboxBridge posts JSON and maps response", async () => {
    process.env.CLAWQL_SANDBOX_BRIDGE_URL = "https://bridge.example.test";
    process.env.CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN = "secret";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          stdout: "ok\n",
          stderr: "",
          exitCode: 0,
          success: true,
          sandboxId: "session-default",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const r = await callSandboxBridge({ code: "print(1)", language: "python" });
    expect(r.success).toBe(true);
    expect(r.stdout).toBe("ok\n");
    expect(r.exitCode).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/exec");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    const body = JSON.parse(init.body as string) as { code: string; language: string };
    expect(body.code).toBe("print(1)");
    expect(body.language).toBe("python");
  });

  it("handleClawqlCodeToolInput returns JSON text", async () => {
    process.env.CLAWQL_SANDBOX_BRIDGE_URL = "https://bridge.example.test";
    process.env.CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN = "secret";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ stdout: "", stderr: "", exitCode: 0, success: true }), {
        status: 200,
      })
    );
    const out = await handleClawqlCodeToolInput({ code: "1", language: "javascript" });
    const parsed = JSON.parse(out.content[0].text) as { success: boolean };
    expect(parsed.success).toBe(true);
  });
});
