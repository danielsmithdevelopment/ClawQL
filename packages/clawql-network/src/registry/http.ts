/**
 * HTTP read/write surface for GatewayRegistryService.
 * Auth: Bearer CLAWQL_NETWORK_REGISTRY_TOKEN (same pattern as CPC provision token).
 *
 * Uses a minimal app shape so clawql-network does not hard-depend on Express.
 */

import { Effect } from "effect";
import {
  GatewayRegistryService,
  gatewayRegistryLiveLayer,
} from "./gateway-registry-service.js";
import type { GatewayKind, RegisterGatewayInput } from "./types.js";

type Req = {
  headers: Record<string, string | string[] | undefined>;
  params: Record<string, string>;
  query: Record<string, unknown>;
  body?: Record<string, unknown>;
};

type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => void;
};

type App = {
  get: (path: string, handler: (req: Req, res: Res) => void | Promise<void>) => void;
  post: (path: string, handler: (req: Req, res: Res) => void | Promise<void>) => void;
};

function bearerOk(req: Req, env: NodeJS.ProcessEnv): boolean {
  const expected = env.CLAWQL_NETWORK_REGISTRY_TOKEN?.trim();
  if (!expected) {
    return env.CLAWQL_NETWORK_REGISTRY_PUBLIC === "1";
  }
  const h = req.headers.authorization ?? "";
  const raw = Array.isArray(h) ? h[0] : h;
  const m = /^Bearer\s+(.+)$/i.exec(raw ?? "");
  return Boolean(m && m[1]!.trim() === expected);
}

function runReg<A>(
  program: Effect.Effect<A, never, GatewayRegistryService>,
  home?: string
): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(gatewayRegistryLiveLayer(home))));
}

/**
 * Mount gateway registry HTTP routes (org-scoped list + register + heartbeat).
 * Compatible with Express `app` (cast if needed).
 */
export function attachGatewayRegistryRoutes(
  app: App,
  options: { env?: NodeJS.ProcessEnv; home?: string; basePath?: string } = {}
): void {
  const env = options.env ?? process.env;
  const home = options.home;
  const base = (options.basePath ?? "/network").replace(/\/$/, "");

  app.get(`${base}/orgs/:orgId/gateways`, async (req, res) => {
    if (!bearerOk(req, env)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const orgId = String(req.params.orgId ?? "").trim();
    const peers = await runReg(
      Effect.gen(function* () {
        const reg = yield* GatewayRegistryService;
        return yield* reg.listMeshPeers(orgId);
      }),
      home
    );
    res.json({ orgId, gateways: peers });
  });

  app.post(`${base}/gateways/register`, async (req, res) => {
    if (!bearerOk(req, env)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const body = req.body ?? {};
    const kind = body.kind === "edge" ? "edge" : body.kind === "regional" ? "regional" : null;
    if (!kind || !body.gatewayId || !body.orgId || !body.meshIdentity) {
      res.status(400).json({
        error: "gatewayId, orgId, kind (regional|edge), meshIdentity required",
      });
      return;
    }
    const input: RegisterGatewayInput = {
      gatewayId: String(body.gatewayId),
      orgId: String(body.orgId),
      kind: kind as GatewayKind,
      meshIdentity: String(body.meshIdentity),
      ownerDeveloper:
        kind === "edge" && body.ownerDeveloper ? String(body.ownerDeveloper) : undefined,
    };
    const record = await runReg(
      Effect.gen(function* () {
        const reg = yield* GatewayRegistryService;
        return yield* reg.registerGateway(input);
      }),
      home
    );
    res.status(201).json(record);
  });

  app.post(`${base}/gateways/:gatewayId/heartbeat`, async (req, res) => {
    if (!bearerOk(req, env)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const gatewayId = String(req.params.gatewayId ?? "").trim();
    const orgId = String(req.body?.orgId ?? req.query.orgId ?? "").trim();
    if (!orgId) {
      res.status(400).json({ error: "orgId required" });
      return;
    }
    const record = await runReg(
      Effect.gen(function* () {
        const reg = yield* GatewayRegistryService;
        return yield* reg.heartbeat(gatewayId, orgId);
      }),
      home
    );
    if (!record) {
      res.status(404).json({ error: "unknown gateway" });
      return;
    }
    res.json(record);
  });
}
