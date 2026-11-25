import { describe, expect, it } from "vitest";
import { buildNatsConnectOptions } from "./client.js";

describe("buildNatsConnectOptions (audit 5.02)", () => {
  it("requires credentials unless insecure", () => {
    delete process.env.CLAWQL_NATS_ALLOW_INSECURE;
    delete process.env.CLAWQL_NATS_USER;
    delete process.env.CLAWQL_NATS_PASS;
    delete process.env.CLAWQL_NATS_TOKEN;
    delete process.env.CLAWQL_NATS_CREDS_FILE;
    expect(() => buildNatsConnectOptions("tls://nats.example:4222")).toThrow(/credentials/i);
  });

  it("requires tls:// or wss:// unless insecure", () => {
    process.env.CLAWQL_NATS_ALLOW_INSECURE = "0";
    process.env.CLAWQL_NATS_TOKEN = "tok";
    expect(() => buildNatsConnectOptions("nats://localhost:4222")).toThrow(/tls:\/\/|wss:\/\//i);
  });

  it("allows insecure local demos", () => {
    process.env.CLAWQL_NATS_ALLOW_INSECURE = "1";
    const opts = buildNatsConnectOptions("nats://localhost:4222");
    expect(opts.servers).toBe("nats://localhost:4222");
  });

  it("accepts user/pass over tls", () => {
    delete process.env.CLAWQL_NATS_ALLOW_INSECURE;
    process.env.CLAWQL_NATS_USER = "u";
    process.env.CLAWQL_NATS_PASS = "p";
    const opts = buildNatsConnectOptions("tls://nats.example:4222");
    expect(opts.user).toBe("u");
    expect(opts.pass).toBe("p");
    expect(opts.tls).toEqual({});
  });
});
