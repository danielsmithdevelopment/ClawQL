import http from "node:http";
import type { AddressInfo } from "node:net";

/** Minimal HTTP server that invokes a Fetch-style handler (for tests without Bun). */
export async function withFetchServer(
  handler: (req: Request) => Response | Promise<Response>,
  fn: (origin: string) => Promise<void>
): Promise<void> {
  let port = 0;
  const server = http.createServer(async (incoming, res) => {
    try {
      const host = `http://127.0.0.1:${port}`;
      const url = new URL(incoming.url ?? "/", host);
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(chunk as Buffer);
      const buf = Buffer.concat(chunks);
      const req = new Request(url, {
        method: incoming.method,
        headers: incoming.headers as HeadersInit,
        body: buf.length ? buf : undefined,
      });
      const out = await handler(req);
      res.statusCode = out.status;
      out.headers.forEach((value, key) => {
        if (key.toLowerCase() === "set-cookie") return;
        res.setHeader(key, value);
      });
      res.end(Buffer.from(await out.arrayBuffer()));
    } catch (e) {
      res.statusCode = 500;
      res.end(e instanceof Error ? e.message : String(e));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });

  port = (server.address() as AddressInfo).port;
  const origin = `http://127.0.0.1:${port}`;
  try {
    await fn(origin);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}
