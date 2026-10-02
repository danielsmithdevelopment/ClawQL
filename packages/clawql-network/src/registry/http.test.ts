/**
 * HTTP surface tests for Gap A gateway registry routes.
 */

import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attachGatewayRegistryRoutes } from "./http.js";
import { GatewayRegistryService, gatewayRegistryLiveLayer } from "./gateway-registry-service.js";

type Handler = (
  req: {
    headers: Record<string, string | string[] | undefined>;
    params: Record<string, string>;
    query: Record<string, unknown>;
    body?: Record<string, unknown>;
  },
  res: {
    status: (code: number) => { json: (body: unknown) => void };
    json: (body: unknown) => void;
  }
) => void | Promise<void>;

function miniApp() {
  const gets = new Map<string, Handler>();
  const posts = new Map<string, Handler>();
  return {
    get: (path: string, handler: Handler) => {
      gets.set(path, handler);
    },
    post: (path: string, handler: Handler) => {
      posts.set(path, handler);
    },
    _gets: gets,
    _posts: posts,
  };
}

describe("attachGatewayRegistryRoutes", () => {
  it("lists mesh peers with bearer token", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-gw-http-"));
    const token = "test-registry-token";
    const env = {
      CLAWQL_HOME: home,
      CLAWQL_NETWORK_REGISTRY_TOKEN: token,
    } as NodeJS.ProcessEnv;

    await Effect.runPromise(
      Effect.gen(function* () {
        const reg = yield* GatewayRegistryService;
        yield* reg.registerGateway({
          gatewayId: "gw-east",
          orgId: "acme",
          kind: "regional",
          meshIdentity: "us-east-1",
        });
      }).pipe(Effect.provide(gatewayRegistryLiveLayer(home)))
    );

    const app = miniApp();
    attachGatewayRegistryRoutes(app, { env, home, basePath: "/network" });

    const handler = app._gets.get("/network/orgs/:orgId/gateways");
    expect(handler).toBeTruthy();

    let statusCode = 0;
    let body: unknown;
    await handler!(
      {
        headers: { authorization: `Bearer ${token}` },
        params: { orgId: "acme" },
        query: {},
      },
      {
        status(code) {
          statusCode = code;
          return {
            json(b) {
              body = b;
            },
          };
        },
        json(b) {
          statusCode = statusCode || 200;
          body = b;
        },
      }
    );

    expect(statusCode).toBe(200);
    expect(body).toMatchObject({
      orgId: "acme",
      gateways: [{ gatewayId: "gw-east", meshIdentity: "us-east-1" }],
    });

    await rm(home, { recursive: true, force: true });
  });

  it("rejects unauthorized list", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-gw-http-unauth-"));
    const env = {
      CLAWQL_HOME: home,
      CLAWQL_NETWORK_REGISTRY_TOKEN: "secret",
    } as NodeJS.ProcessEnv;
    const app = miniApp();
    attachGatewayRegistryRoutes(app, { env, home });

    const handler = app._gets.get("/network/orgs/:orgId/gateways")!;
    let statusCode = 0;
    await handler(
      { headers: {}, params: { orgId: "acme" }, query: {} },
      {
        status(code) {
          statusCode = code;
          return { json() {} };
        },
        json() {},
      }
    );
    expect(statusCode).toBe(401);
    await rm(home, { recursive: true, force: true });
  });
});
