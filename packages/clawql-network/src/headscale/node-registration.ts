/**
 * Register this node with the Headscale mesh (spec §4) and optionally
 * enroll into the org-scoped gateway registry (Gap A).
 */

import { Effect } from "effect";

import { NetworkCommandError } from "../errors.js";
import { commandAvailable, spawnCollect } from "../internal/subprocess.js";
import {
  GatewayRegistryService,
  gatewayRegistryLiveLayer,
} from "../registry/gateway-registry-service.js";
import type { GatewayKind } from "../registry/types.js";

export type MeshIdentity = {
  readonly nodeId: string;
  readonly meshAddress: string;
  readonly namespace: string;
};

export type JoinMeshOptions = {
  readonly namespace?: string;
  readonly loginServerUrl?: string;
  /** When set (or via CLAWQL_ORG_ID), register into org gateway registry. */
  readonly orgId?: string;
  readonly kind?: GatewayKind;
  readonly ownerDeveloper?: string;
  readonly gatewayId?: string;
  /** Override CLAWQL_HOME for registry persistence. */
  readonly home?: string;
  /** Skip registry write even when orgId present. */
  readonly skipRegistry?: boolean;
};

type TailscaleStatusJson = {
  Self?: { ID?: string; HostName?: string; DNSName?: string };
};

const parseTailscaleStatus = (stdout: string, namespace: string): MeshIdentity | null => {
  try {
    const parsed = JSON.parse(stdout) as TailscaleStatusJson;
    const self = parsed.Self;
    if (!self?.ID) return null;
    const meshAddress = self.DNSName?.replace(/\.$/, "") || self.HostName || self.ID;
    return {
      nodeId: self.ID,
      meshAddress,
      namespace,
    };
  } catch {
    return null;
  }
};

const resolveOrgId = (options: JoinMeshOptions): string =>
  options.orgId?.trim() || process.env.CLAWQL_ORG_ID?.trim() || "";

const resolveKind = (options: JoinMeshOptions): GatewayKind => {
  if (options.kind === "edge" || options.kind === "regional") return options.kind;
  const envKind = process.env.CLAWQL_GATEWAY_KIND?.trim().toLowerCase();
  return envKind === "edge" ? "edge" : "regional";
};

/** Register this node with the Headscale mesh (spec §4). */
export const joinMesh = (
  nodeId: string,
  options: JoinMeshOptions = {}
): Effect.Effect<MeshIdentity, NetworkCommandError> =>
  Effect.gen(function* () {
    const namespace = options.namespace ?? "clawql";
    let identity: MeshIdentity | null = null;

    const tailscaleCli = yield* commandAvailable("tailscale");
    if (tailscaleCli) {
      const authKey = process.env.CLAWQL_HEADSCALE_AUTHKEY?.trim();
      if (options.loginServerUrl && authKey) {
        yield* spawnCollect(
          "tailscale",
          ["up", "--login-server", options.loginServerUrl, "--authkey", authKey],
          { timeoutMs: 120_000 }
        ).pipe(Effect.catchAll(() => Effect.succeed(undefined)));
      }
      const status = yield* spawnCollect("tailscale", ["status", "--json"], {
        timeoutMs: 15_000,
      }).pipe(Effect.catchAll(() => Effect.succeed({ stdout: "{}", stderr: "", exitCode: 0 })));
      identity = parseTailscaleStatus(status.stdout, namespace);
    }

    if (!identity) {
      const headscaleCli = yield* commandAvailable("headscale");
      if (headscaleCli) {
        const nodes = yield* spawnCollect("headscale", ["nodes", "list", "--output", "json"], {
          timeoutMs: 30_000,
        }).pipe(Effect.catchAll(() => Effect.succeed({ stdout: "[]", stderr: "", exitCode: 0 })));
        const list = JSON.parse(nodes.stdout || "[]") as Array<{
          id?: string;
          name?: string;
          givenName?: string;
        }>;
        const match = list.find((n) => n.name === nodeId || n.givenName === nodeId) ?? list[0];
        if (match?.id) {
          identity = {
            nodeId: match.id,
            meshAddress: match.givenName ?? match.name ?? match.id,
            namespace,
          };
        }
      }
    }

    if (!identity) {
      identity = {
        nodeId,
        meshAddress: `${nodeId}.clawql.local`,
        namespace,
      };
    }

    const orgId = resolveOrgId(options);
    if (orgId && !options.skipRegistry) {
      const kind = resolveKind(options);
      const gatewayId = (options.gatewayId?.trim() || identity.nodeId).trim();
      const ownerDeveloper =
        kind === "edge"
          ? options.ownerDeveloper?.trim() ||
            process.env.CLAWQL_GATEWAY_OWNER?.trim() ||
            undefined
          : undefined;
      yield* Effect.gen(function* () {
        const reg = yield* GatewayRegistryService;
        yield* reg.registerGateway({
          gatewayId,
          orgId,
          kind,
          meshIdentity: identity!.meshAddress,
          ownerDeveloper,
        });
      }).pipe(
        Effect.provide(gatewayRegistryLiveLayer(options.home)),
        Effect.catchAll(() => Effect.void)
      );
    }

    return identity;
  });
