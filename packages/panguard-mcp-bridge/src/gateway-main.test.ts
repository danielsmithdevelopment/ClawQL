import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { createPanguardBridgeApp } from "./gateway-main.js";

describe("createPanguardBridgeApp", () => {
  it("serves GET /healthz", async () => {
    const app = await createPanguardBridgeApp({
      upstreamUrl: "http://127.0.0.1:65530/mcp",
      shimPath: "/nonexistent/shim.js",
    });
    const server = createServer(app);
    await new Promise<void>((resolveListen, rejectListen) => {
      server.listen(0, "127.0.0.1", () => resolveListen());
      server.on("error", rejectListen);
    });
    const addr = server.address();
    const port = typeof addr === "object" && addr && "port" in addr ? addr.port : 0;
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(res.ok).toBe(true);
    expect(await res.text()).toBe("ok");
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((err) => (err ? rejectClose(err) : resolveClose()));
    });
  });
});
