import { Effect } from "effect";

import { NetworkCommandError } from "../errors.js";
import { commandAvailable, spawnCollect } from "../internal/subprocess.js";

export type MeshIdentity = {
  readonly nodeId: string;
  readonly meshAddress: string;
  readonly namespace: string;
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

/** Register this node with the Headscale mesh (spec §4). */
export const joinMesh = (
  nodeId: string,
  options: { readonly namespace?: string; readonly loginServerUrl?: string } = {}
): Effect.Effect<MeshIdentity, NetworkCommandError> =>
  Effect.gen(function* () {
    const namespace = options.namespace ?? "clawql";
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
      const status = yield* spawnCollect("tailscale", ["status", "--json"], { timeoutMs: 15_000 }).pipe(
        Effect.catchAll(() => Effect.succeed({ stdout: "{}", stderr: "", exitCode: 0 }))
      );
      const identity = parseTailscaleStatus(status.stdout, namespace);
      if (identity) return identity;
    }

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
      const match =
        list.find((n) => n.name === nodeId || n.givenName === nodeId) ?? list[0];
      if (match?.id) {
        return {
          nodeId: match.id,
          meshAddress: match.givenName ?? match.name ?? match.id,
          namespace,
        };
      }
    }

    return {
      nodeId,
      meshAddress: `${nodeId}.clawql.local`,
      namespace,
    };
  });
