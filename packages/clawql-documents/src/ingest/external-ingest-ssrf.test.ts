import { afterEach, describe, expect, it, vi } from "vitest";
import { assertSafeExternalIngestUrl, fetchUrlResource } from "./external-ingest.js";

describe("external-ingest SSRF gate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks private, link-local, and metadata hosts", () => {
    expect(() => assertSafeExternalIngestUrl("https://169.254.169.254/latest/meta-data/")).toThrow(
      /private|link-local/i
    );
    expect(() => assertSafeExternalIngestUrl("https://10.0.0.1/secret")).toThrow(/private|link-local/i);
    expect(() => assertSafeExternalIngestUrl("https://192.168.1.1/")).toThrow(/private|link-local/i);
    expect(() => assertSafeExternalIngestUrl("https://172.16.0.1/")).toThrow(/private|link-local/i);
    expect(() => assertSafeExternalIngestUrl("https://172.31.255.255/")).toThrow(/private|link-local/i);
    expect(() => assertSafeExternalIngestUrl("https://metadata.google.internal/")).toThrow(/not allowed/i);
    expect(() => assertSafeExternalIngestUrl("http://example.com/x")).toThrow(/localhost/i);
  });

  it("allows public https and loopback http", () => {
    expect(assertSafeExternalIngestUrl("https://example.com/a").hostname).toBe("example.com");
    expect(assertSafeExternalIngestUrl("http://127.0.0.1:9/").hostname).toBe("127.0.0.1");
    expect(assertSafeExternalIngestUrl("http://localhost:9/").hostname).toBe("localhost");
  });

  it("rejects redirects that hop into private networks", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const href = String(input);
      if (href.includes("public.example")) {
        return new Response(null, {
          status: 302,
          headers: { Location: "https://169.254.169.254/latest/meta-data/" },
        });
      }
      return new Response("should-not-fetch", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchUrlResource("https://public.example/start")).rejects.toThrow(
      /private|link-local/i
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects bodies over the byte cap even when Content-Length lies", async () => {
    const big = "x".repeat(2 * 1024 * 1024 + 1);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(big, {
          status: 200,
          headers: { "Content-Type": "text/plain", "Content-Length": "10" },
        });
      })
    );
    await expect(fetchUrlResource("https://example.com/big")).rejects.toThrow(/exceeds cap/i);
  });
});
