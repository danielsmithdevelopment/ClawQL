/**
 * In-process OTLP HTTP receiver: asserts a real export hits the wire when
 * CLAWQL_ENABLE_OTEL_TRACING + OTEL_EXPORTER_OTLP_ENDPOINT are set (no testcontainers).
 */

import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { maybeInitOtelTracing, wrapMcpToolHandler } from "./otel-tracing.js";

function startOtlpTraceReceiver(): Promise<{
  endpointBase: string;
  firstBody: Promise<Buffer>;
  close: () => Promise<void>;
}> {
  let resolveBody!: (buf: Buffer) => void;
  const firstBody = new Promise<Buffer>((resolve) => {
    resolveBody = resolve;
  });

  const server = createServer((req, res) => {
    if (req.method !== "POST" || !req.url?.includes("/v1/traces")) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      chunks.push(c);
    });
    req.on("end", () => {
      const buf = Buffer.concat(chunks);
      resolveBody(buf);
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("expected TCP bind address"));
        return;
      }
      resolve({
        endpointBase: `http://127.0.0.1:${addr.port}`,
        firstBody,
        close: () =>
          new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
    server.on("error", reject);
  });
}

describe("otel OTLP export (integration)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exports at least one span to a local OTLP HTTP receiver on shutdown", async () => {
    const receiver = await startOtlpTraceReceiver();
    vi.stubEnv("CLAWQL_ENABLE_OTEL_TRACING", "1");
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", receiver.endpointBase);
    vi.stubEnv("OTEL_SERVICE_NAME", "clawql-vitest-otlp-receiver");

    const shutdown = await maybeInitOtelTracing();
    expect(typeof shutdown).toBe("function");

    const inner = vi.fn(async () => ({ ok: true }));
    const wrapped = wrapMcpToolHandler("cache", inner);
    await wrapped();

    await shutdown!();
    const body = await receiver.firstBody;

    expect(body.length).toBeGreaterThan(32);
    // OTLP HTTP uses protobuf by default; span name is still present as UTF-8 bytes.
    expect(body.includes(Buffer.from("mcp.tool.cache"))).toBe(true);

    await receiver.close();
  }, 45_000);
});
