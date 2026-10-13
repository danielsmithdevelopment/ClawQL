import http from "node:http";
import type { AddressInfo } from "node:net";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import {
  CLAWQL_PARSE_START_MS,
  CLAWQL_PARSE_T0_ISO,
  installHttpParseTiming,
  parseToHandlerQueueMs,
  resetHttpParseTimingForTests,
  type IncomingMessageWithParseTiming,
} from "./mcp-http-parse-timing.js";

afterEach(() => {
  Effect.runSync(resetHttpParseTimingForTests());
});

describe("mcp-http-parse-timing", () => {
  it("stamps IncomingMessage on http.server.request.start", async () => {
    expect(Effect.runSync(installHttpParseTiming())).toBe(true);
    // Second install is a no-op.
    expect(Effect.runSync(installHttpParseTiming())).toBe(false);

    const server = http.createServer((req, res) => {
      const stamped = req as IncomingMessageWithParseTiming;
      expect(typeof stamped[CLAWQL_PARSE_START_MS]).toBe("number");
      expect(typeof stamped[CLAWQL_PARSE_T0_ISO]).toBe("string");
      const handlerStart = performance.now();
      const queueMs = Effect.runSync(parseToHandlerQueueMs(req, handlerStart));
      expect(queueMs).not.toBeNull();
      expect(queueMs!).toBeGreaterThanOrEqual(0);
      expect(queueMs!).toBeLessThan(50);
      res.end("ok");
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => resolve());
      server.on("error", reject);
    });
    const port = (server.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/mcp`);
      expect(res.status).toBe(200);
      await res.text();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
