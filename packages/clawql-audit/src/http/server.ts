/**
 * Optional Node HTTP server exposing /entries and /chain routes.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Effect } from "effect";
import type { Context } from "effect";
import { AuditError } from "../errors.js";
import type { WORMAuditTrailService } from "../trail.js";
import { handleAuditHttpRequest, type AuditHttpDeps } from "./routes.js";

export type AuditHttpServerHandle = {
  readonly port: number;
  readonly close: () => Effect.Effect<void, AuditError>;
};

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(JSON.parse(raw));
      } catch (cause) {
        reject(cause);
      }
    });
    req.on("error", reject);
  });
}

export const startAuditHttpServer = (
  trail: Context.Tag.Service<typeof WORMAuditTrailService>,
  options: { port: number; apiKey: string }
): Effect.Effect<AuditHttpServerHandle, AuditError> =>
  Effect.tryPromise({
    try: () =>
      new Promise<AuditHttpServerHandle>((resolve, reject) => {
        const deps: AuditHttpDeps = { trail, apiKey: options.apiKey };
        const server: Server = createServer((req, res) => {
          void dispatch(req, res, deps);
        });
        server.once("error", reject);
        server.listen(options.port, () => {
          const addr = server.address();
          const port = typeof addr === "object" && addr ? addr.port : options.port;
          resolve({
            port,
            close: () =>
              Effect.tryPromise({
                try: () =>
                  new Promise<void>((resClose, rejClose) => {
                    server.close((err) => (err ? rejClose(err) : resClose()));
                  }),
                catch: (cause) => new AuditError({ reason: "HTTP server close failed", cause }),
              }),
          });
        });
      }),
    catch: (cause) => new AuditError({ reason: "HTTP server listen failed", cause }),
  });

async function dispatch(
  req: IncomingMessage,
  res: ServerResponse,
  deps: AuditHttpDeps
): Promise<void> {
  try {
    const body =
      req.method === "POST" || req.method === "PUT" || req.method === "PATCH"
        ? await readBody(req)
        : undefined;
    const headers: Record<string, string | string[] | undefined> = {};
    for (const [k, v] of Object.entries(req.headers)) headers[k] = v;
    const response = await Effect.runPromise(
      handleAuditHttpRequest(
        {
          method: req.method ?? "GET",
          url: req.url ?? "/",
          headers,
          body,
        },
        deps
      )
    );
    res.writeHead(response.status, response.headers);
    res.end(JSON.stringify(response.body));
  } catch (err) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal error",
      })
    );
  }
}
