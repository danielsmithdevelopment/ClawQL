import { describe, expect, it } from "vitest";
import { validateSyntheticTarget } from "./schedule.js";

describe("validateSyntheticTarget SSRF (clawql-core egress)", () => {
  it("blocks loopback, RFC1918 including 172.16/12, and link-local", () => {
    expect(validateSyntheticTarget("https://127.0.0.1/x").ok).toBe(false);
    expect(validateSyntheticTarget("https://10.1.2.3/x").ok).toBe(false);
    expect(validateSyntheticTarget("https://192.168.0.1/x").ok).toBe(false);
    expect(validateSyntheticTarget("https://169.254.169.254/latest").ok).toBe(false);
    expect(validateSyntheticTarget("https://172.16.0.1/x").ok).toBe(false);
    expect(validateSyntheticTarget("https://172.31.255.255/x").ok).toBe(false);
    expect(validateSyntheticTarget("https://172.32.0.1/x").ok).toBe(true);
  });

  it("blocks CGNAT and IPv4-mapped loopback via core isPrivateOrLoopbackIp", () => {
    expect(validateSyntheticTarget("https://100.64.1.1/x").ok).toBe(false);
    expect(validateSyntheticTarget("https://[::ffff:7f00:1]/x").ok).toBe(false);
  });

  it("allows public https when no allowlist is set", () => {
    expect(validateSyntheticTarget("https://example.com/health").ok).toBe(true);
  });
});
